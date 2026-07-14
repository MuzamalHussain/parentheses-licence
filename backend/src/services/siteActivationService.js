const License = require("../models/License");
const LicenseSite = require("../models/LicenseSite");
const LicenseActivation = require("../models/LicenseActivation");
const { AppError } = require("../utils/errorHandler");
const {
  normalizeDomain,
  isValidDomain,
  isLocalhostDomain,
  isPrivateHost,
  isStagingDomain,
} = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const { maskLicenseKey } = require("../utils/licenseKey");

const SITE_STATUSES = ["active", "inactive", "disconnected", "suspended", "revoked", "expired"];
const ENVIRONMENTS = ["production", "staging", "development", "localhost", "unknown"];

function normalizeSiteUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function detectEnvironment({ domain, siteUrl = "", environment = "" }) {
  const requested = String(environment || "").trim().toLowerCase();
  if (ENVIRONMENTS.includes(requested) && requested !== "unknown") return requested;
  const normalized = normalizeDomain(domain || siteUrl);
  if (isLocalhostDomain(normalized) || isPrivateHost(normalized)) return "localhost";
  if (isStagingDomain(normalized)) return "staging";
  if (/\b(dev|development)\b/i.test(siteUrl)) return "development";
  return normalized ? "production" : "unknown";
}

function normalizedActivationInput(input = {}) {
  const siteUrl = normalizeSiteUrl(input.siteUrl || input.site_url || input.url || input.domain);
  const domain = normalizeDomain(input.domain || siteUrl);
  return {
    siteName: String(input.siteName || input.site_name || input.name || "").trim(),
    siteUrl,
    domain,
    environment: detectEnvironment({ domain, siteUrl, environment: input.environment }),
    pluginVersion: String(input.pluginVersion || input.plugin_version || input.currentVersion || input.current_version || "").trim(),
    wordpressVersion: String(input.wordpressVersion || input.wpVersion || input.wp_version || "").trim(),
    phpVersion: String(input.phpVersion || input.php_version || "").trim(),
    heartbeatNonce: String(input.heartbeatNonce || input.heartbeat_nonce || "").trim(),
  };
}

function ensureValidDomain(domain) {
  if (!isValidDomain(domain)) throw new AppError("Invalid domain format.", 422);
}

async function audit({ actor, action, license, site, req, metadata = {} }) {
  await writeAuditLog({
    actor,
    action,
    targetType: site ? "LicenseSite" : "License",
    targetId: site?._id || license?._id || null,
    metadata: {
      licenseId: license?._id,
      licenseKey: maskLicenseKey(license?.licenseKey),
      domain: site?.domain,
      ...metadata,
    },
    ip: req?.ip,
  });
}

async function syncActiveDomain({ licenseId, domain, active }) {
  if (active) {
    const license = await License.findById(licenseId).select("activeDomains").lean();
    if (license?.activeDomains?.some((entry) => normalizeDomain(entry.domain) === domain)) return;
    await License.findOneAndUpdate(
      { _id: licenseId, "activeDomains.domain": { $ne: domain } },
      { $push: { activeDomains: { domain, activatedAt: new Date() } } },
      { new: true }
    );
  } else {
    const license = await License.findById(licenseId).select("activeDomains").lean();
    const storedDomains = (license?.activeDomains || [])
      .filter((entry) => normalizeDomain(entry.domain) === domain)
      .map((entry) => entry.domain);
    if (storedDomains.length) {
      await License.findByIdAndUpdate(licenseId, { $pull: { activeDomains: { domain: { $in: storedDomains } } } });
    }
  }
}

async function upsertSiteActivation({ license, input, actor = null, actorRole = "plugin", req = null }) {
  const normalized = normalizedActivationInput(input);
  ensureValidDomain(normalized.domain);

  const existing = await LicenseSite.findOne({ licenseId: license._id, domain: normalized.domain });
  if (existing?.blacklisted) throw new AppError("This site is blocked for activation.", 403);

  const now = new Date();
  const payload = {
    userId: license.userId?._id || license.userId,
    productId: license.productId?._id || license.productId,
    siteName: normalized.siteName || existing?.siteName || normalized.domain,
    siteUrl: normalized.siteUrl || existing?.siteUrl || "",
    environment: normalized.environment,
    pluginVersion: normalized.pluginVersion || existing?.pluginVersion || "",
    wordpressVersion: normalized.wordpressVersion || existing?.wordpressVersion || "",
    phpVersion: normalized.phpVersion || existing?.phpVersion || "",
    lastContactAt: now,
    lastValidationAt: now,
    lastLicenseStatus: license.status,
    status: "active",
    deactivatedAt: null,
  };

  const site = await LicenseSite.findOneAndUpdate(
    { licenseId: license._id, domain: normalized.domain },
    {
      $set: payload,
      $setOnInsert: {
        licenseId: license._id,
        domain: normalized.domain,
        activatedAt: now,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  await syncActiveDomain({ licenseId: license._id, domain: normalized.domain, active: true });
  await LicenseActivation.create({
    licenseId: license._id,
    domain: normalized.domain,
    action: actorRole === "admin" ? "manual_activate" : "activate",
    actorId: actor?._id || null,
    actorRole,
    ipAddress: req?.ip || "",
  });
  await audit({ actor, action: "site.activated", license, site, req, metadata: { actorRole, environment: site.environment } });
  return site;
}

async function heartbeat({ license, input, req = null }) {
  const normalized = normalizedActivationInput(input);
  ensureValidDomain(normalized.domain);
  const site = await LicenseSite.findOne({ licenseId: license._id, domain: normalized.domain });
  if (!site) throw new AppError("Site is not activated on this license.", 404);
  if (site.blacklisted) throw new AppError("This site is blocked.", 403);
  if (normalized.heartbeatNonce && normalized.heartbeatNonce === site.lastHeartbeatNonce) {
    throw new AppError("Duplicate heartbeat rejected.", 409);
  }

  site.lastHeartbeatAt = new Date();
  site.lastContactAt = site.lastHeartbeatAt;
  site.lastValidationAt = site.lastHeartbeatAt;
  site.lastLicenseStatus = license.status;
  site.environment = normalized.environment;
  site.pluginVersion = normalized.pluginVersion || site.pluginVersion;
  site.wordpressVersion = normalized.wordpressVersion || site.wordpressVersion;
  site.phpVersion = normalized.phpVersion || site.phpVersion;
  site.siteUrl = normalized.siteUrl || site.siteUrl;
  site.status = license.status === "expired" ? "expired" : site.status === "suspended" ? "suspended" : "active";
  if (normalized.heartbeatNonce) site.lastHeartbeatNonce = normalized.heartbeatNonce;
  await site.save();
  await audit({ action: "site.heartbeat", license, site, req, metadata: { pluginVersion: site.pluginVersion, environment: site.environment } });
  return site;
}

async function validateSite({ license, input, req = null }) {
  const normalized = normalizedActivationInput(input);
  ensureValidDomain(normalized.domain);
  const site = await LicenseSite.findOne({ licenseId: license._id, domain: normalized.domain });
  if (!site || !["active", "suspended"].includes(site.status)) throw new AppError("Site is not activated on this license.", 403);
  site.lastValidationAt = new Date();
  site.lastContactAt = site.lastValidationAt;
  site.lastLicenseStatus = license.status;
  await site.save();
  await audit({ action: "site.validated", license, site, req });
  return site;
}

async function deactivateSite({ license, domain, actor = null, actorRole = "customer", req = null, force = false }) {
  const normalizedDomain = normalizeDomain(domain);
  ensureValidDomain(normalizedDomain);
  const site = await LicenseSite.findOne({ licenseId: license._id, domain: normalizedDomain });
  if (!site) throw new AppError("Site is not activated on this license.", 404);
  site.status = force ? "disconnected" : "inactive";
  site.deactivatedAt = new Date();
  site.deactivatedBy = actor?._id || null;
  await site.save();
  await syncActiveDomain({ licenseId: license._id, domain: normalizedDomain, active: false });
  await LicenseActivation.create({
    licenseId: license._id,
    domain: normalizedDomain,
    action: force ? "force_deactivate" : "deactivate",
    actorId: actor?._id || null,
    actorRole,
    ipAddress: req?.ip || "",
  });
  await audit({ actor, action: force ? "site.force_deactivated" : "site.deactivated", license, site, req, metadata: { actorRole } });
  return site;
}

async function renameSite({ license, domain, siteName, actor = null, actorRole = "customer", req = null }) {
  const normalizedDomain = normalizeDomain(domain);
  const site = await LicenseSite.findOne({ licenseId: license._id, domain: normalizedDomain });
  if (!site) throw new AppError("Site is not activated on this license.", 404);
  site.siteName = String(siteName || "").trim().slice(0, 150) || site.siteName;
  await site.save();
  await audit({ actor, action: "site.renamed", license, site, req, metadata: { actorRole, siteName: site.siteName } });
  return site;
}

async function adminSiteAction({ license, domain, action, actor, req, siteName }) {
  if (action === "rename") return renameSite({ license, domain, siteName, actor, actorRole: "admin", req });
  if (action === "deactivate") return deactivateSite({ license, domain, actor, actorRole: "admin", req });
  if (action === "force_deactivate") return deactivateSite({ license, domain, actor, actorRole: "admin", req, force: true });

  const normalizedDomain = normalizeDomain(domain);
  const site = await LicenseSite.findOne({ licenseId: license._id, domain: normalizedDomain });
  if (!site) throw new AppError("Site is not activated on this license.", 404);
  if (action === "suspend") {
    site.status = "suspended";
    site.suspendedAt = new Date();
    site.suspendedBy = actor?._id || null;
  } else if (action === "whitelist") {
    site.whitelisted = true;
    site.blacklisted = false;
  } else if (action === "blacklist") {
    site.blacklisted = true;
    site.whitelisted = false;
    site.status = "revoked";
    await syncActiveDomain({ licenseId: license._id, domain: normalizedDomain, active: false });
  } else {
    throw new AppError("Unsupported site action.", 422);
  }
  await site.save();
  await audit({ actor, action: `site.${action}`, license, site, req });
  return site;
}

module.exports = {
  SITE_STATUSES,
  ENVIRONMENTS,
  normalizeSiteUrl,
  detectEnvironment,
  normalizedActivationInput,
  upsertSiteActivation,
  heartbeat,
  validateSite,
  deactivateSite,
  renameSite,
  adminSiteAction,
};
