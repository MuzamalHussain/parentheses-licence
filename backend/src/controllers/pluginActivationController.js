const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const PluginVersion = require("../models/PluginVersion");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain, domainPolicyViolation } = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const { isNewerVersion } = require("../utils/semver");
const { logInfo } = require("../utils/logger");
const licenseEngineConfig = require("../config/licenseEngine");
const {
  ACTIVE_STATES,
  markExpiredIfNeeded,
  entitlementSummary,
} = require("../services/licenseLifecycleService");
const siteActivation = require("../services/siteActivationService");

const populateLicenseForPlugin = (query) =>
  query
    .populate("productId", "name slug status")
    .populate("planId", "name allowedSites")
    .populate("userId", "_id status");

function isPastExpiry(expiresAt) {
  if (!expiresAt) return false;
  const graceMs = licenseEngineConfig.expiration.gracePeriodDays * 24 * 60 * 60 * 1000;
  return Date.now() > new Date(expiresAt).getTime() + graceMs;
}

async function resolveLicense(licenseKey, productSlug) {
  const license = await populateLicenseForPlugin(License.findOne({ licenseKey }));

  if (!license) return { error: "License key not found.", code: 404, errorCode: "LICENSE_NOT_FOUND" };
  if (!license.userId) return { error: "Customer account not found.", code: 403, errorCode: "LICENSE_INACTIVE" };
  if (!license.productId) return { error: "Product not found.", code: 403, errorCode: "PRODUCT_MISMATCH" };
  if (!license.planId) return { error: "License plan not found.", code: 403, errorCode: "LICENSE_INACTIVE" };
  if (license.status === "revoked") return { error: "This license has been revoked.", code: 403, errorCode: "LICENSE_REVOKED" };
  if (license.status === "cancelled") return { error: "This license has been cancelled.", code: 403, errorCode: "LICENSE_INACTIVE" };
  if (license.status === "suspended") return { error: "This license is currently suspended. Contact support.", code: 403, errorCode: "LICENSE_SUSPENDED" };
  if (license.status === "expired") return { error: "This license has expired.", code: 403, errorCode: "LICENSE_EXPIRED" };

  await markExpiredIfNeeded(license);
  if (license.status === "expired") {
    return { error: "This license has expired.", code: 403, errorCode: "LICENSE_EXPIRED" };
  }
  if (!entitlementSummary(license).canActivate) return { error: "This license is not eligible for activation.", code: 403, errorCode: "LICENSE_INACTIVE" };

  if (productSlug && license.productId?.slug !== productSlug) {
    return { error: "This license key is not valid for this product.", code: 403, errorCode: "PRODUCT_MISMATCH" };
  }

  if (license.productId?.status === "archived") {
    return { error: "This product is no longer available.", code: 403, errorCode: "PRODUCT_MISMATCH" };
  }

  return { license };
}

function validateDomainInput(domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) return { error: "Invalid domain format.", code: 422 };

  const policyError = domainPolicyViolation(normalizedDomain, licenseEngineConfig.activation);
  if (policyError) return { error: "This domain is not allowed for activation.", code: 403, policyError };

  return { normalizedDomain };
}

function isDomainActive(license, normalizedDomain) {
  return license.activeDomains.some((entry) => normalizeDomain(entry.domain) === normalizedDomain);
}

function safeResponse(license, message) {
  return {
    success: true,
    message,
    status: license.status,
    product: license.productId?.name,
    plan: license.planId?.name,
    allowedSites: license.allowedSites === 0 ? "unlimited" : license.allowedSites,
    usedSites: license.activeDomains.length,
    expiresAt: license.expiresAt || null,
    activeDomains: license.activeDomains.map((d) => d.domain),
  };
}

function maskLicenseKey(licenseKey = "") {
  const compact = String(licenseKey).replace(/-/g, "");
  if (compact.length <= 8) return "****";
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

function canUseSiteActivationMirror(license) {
  return /^[0-9a-fA-F]{24}$/.test(String(license?._id || ""));
}

async function recordActivationMirror({ license, domain, input, actorRole = "plugin", req }) {
  if (canUseSiteActivationMirror(license)) {
    return siteActivation.upsertSiteActivation({ license, input: { ...input, domain }, actorRole, req });
  }
  await LicenseActivation.create({
    licenseId: license._id,
    domain,
    action: actorRole === "admin" ? "manual_activate" : "activate",
    actorRole,
    ipAddress: req?.ip || "",
  });
  return null;
}

async function reloadLicenseForResponse(licenseId) {
  return populateLicenseForPlugin(License.findById(licenseId));
}

async function auditPublicLicenseEvent({ req, action, license = null, licenseKey = "", domain = "", reason = "" }) {
  await writeAuditLog({
    action,
    targetType: license ? "License" : "",
    targetId: license?._id || null,
    metadata: {
      licenseKey: maskLicenseKey(license?.licenseKey || licenseKey),
      domain,
      reason,
    },
    ip: req.ip,
  });
}

async function failedValidation(res, { req, license = null, licenseKey = "", domain = "", reason = "", code = 403 }) {
  await auditPublicLicenseEvent({
    req,
    action: "license.validation_failed",
    license,
    licenseKey,
    domain,
    reason,
  });
  return res.status(code).json({
    success: false,
    valid: false,
    message: "License is invalid or not entitled for this domain.",
  });
}

function limitExceededResponse(res, license) {
  const siteLimit = license.allowedSites;
  return res.status(403).json({
    success: false,
    code: "ACTIVATION_LIMIT_REACHED",
    message: `Site limit reached (${siteLimit} site${siteLimit !== 1 ? "s" : ""} allowed). Deactivate another domain first.`,
    allowedSites: siteLimit,
    usedSites: license.activeDomains.length,
    activeDomains: license.activeDomains.map((d) => d.domain),
  });
}

exports.activate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const { normalizedDomain, error: domainError, code: domainCode, policyError } = validateDomainInput(domain);
  if (domainError) {
    await auditPublicLicenseEvent({ req, action: "license.suspicious_activity", licenseKey, domain, reason: policyError || "invalid_domain" });
    throw new AppError(domainError, domainCode);
  }

  const normalizedKey = licenseKey.toUpperCase().trim();
  logInfo("license_activation.requested", {
    status: "requested",
    license: maskLicenseKey(normalizedKey),
    domain: normalizedDomain,
  });

  const { license, error, code, errorCode } = await resolveLicense(normalizedKey, productSlug);
  if (error) {
    await auditPublicLicenseEvent({ req, action: "license.activation_failed", licenseKey: normalizedKey, domain: normalizedDomain, reason: error });
    return res.status(code).json({ success: false, code: errorCode, message: error });
  }

  if (isDomainActive(license, normalizedDomain)) {
    await recordActivationMirror({ license, domain: normalizedDomain, input: req.body, actorRole: "plugin", req }).catch(() => {});
    logInfo("license_activation.already_active", {
      status: "already_active",
      license: maskLicenseKey(normalizedKey),
      domain: normalizedDomain,
    });
    return res.json(safeResponse(license, "License is already active on this domain."));
  }

  const activatedAt = new Date();
  const updatedLicense = await License.findOneAndUpdate(
    {
      _id: license._id,
      status: license.status,
      "activeDomains.domain": { $ne: normalizedDomain },
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date(activatedAt.getTime() - (licenseEngineConfig.expiration.gracePeriodDays * 24 * 60 * 60 * 1000)) } }] },
        {
          $or: [
            { allowedSites: 0 },
            { $expr: { $lt: [{ $size: "$activeDomains" }, "$allowedSites"] } },
          ],
        },
      ],
    },
    {
      $push: { activeDomains: { domain: normalizedDomain, activatedAt } },
    },
    { new: true, runValidators: true }
  );

  if (!updatedLicense) {
    const latest = await reloadLicenseForResponse(license._id);
    if (!latest) return res.status(404).json({ success: false, code: "LICENSE_NOT_FOUND", message: "License key not found." });

    if (isDomainActive(latest, normalizedDomain)) {
      logInfo("license_activation.already_active_after_race", {
        status: "already_active_after_race",
        license: maskLicenseKey(normalizedKey),
        domain: normalizedDomain,
      });
      return res.json(safeResponse(latest, "License is already active on this domain."));
    }

    if (latest.status === "suspended") {
      return res.status(403).json({ success: false, code: "LICENSE_SUSPENDED", message: "This license is currently suspended. Contact support." });
    }
    if (latest.status === "revoked") {
      return res.status(403).json({ success: false, code: "LICENSE_REVOKED", message: "This license has been revoked." });
    }
    if (latest.status === "cancelled") {
      return res.status(403).json({ success: false, code: "LICENSE_INACTIVE", message: "This license has been cancelled." });
    }
    if (latest.status === "expired" || isPastExpiry(latest.expiresAt)) {
      return res.status(403).json({ success: false, code: "LICENSE_EXPIRED", message: "This license has expired." });
    }

    logInfo("license_activation.limit_exceeded", {
      status: "limit_exceeded",
      license: maskLicenseKey(normalizedKey),
      domain: normalizedDomain,
      allowedSites: latest.allowedSites,
      usedSites: latest.activeDomains.length,
    });
    return limitExceededResponse(res, latest);
  }

  await recordActivationMirror({ license: updatedLicense, domain: normalizedDomain, input: req.body, actorRole: "plugin", req });

  await writeAuditLog({
    action: "license.domain_activated",
    targetType: "License",
    targetId: updatedLicense._id,
    metadata: { licenseKey: maskLicenseKey(updatedLicense.licenseKey), domain: normalizedDomain },
    ip: req.ip,
  });

  logInfo("license_activation.created", {
    status: "created",
    license: maskLicenseKey(normalizedKey),
    domain: normalizedDomain,
  });

  const responseLicense = await reloadLicenseForResponse(updatedLicense._id);
  return res.status(201).json(safeResponse(responseLicense, "License activated successfully."));
});

exports.deactivate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const { normalizedDomain, error: domainError, code: domainCode } = validateDomainInput(domain);
  if (domainError) throw new AppError(domainError, domainCode);

  const normalizedKey = licenseKey.toUpperCase().trim();
  const { license, error, code } = await resolveLicense(normalizedKey, productSlug);

  if (error && code !== 403) {
    return res.status(code).json({ success: false, message: error });
  }
  if (!license) {
    return res.status(code).json({ success: false, message: error });
  }

  const storedDomains = license.activeDomains
    .filter((entry) => normalizeDomain(entry.domain) === normalizedDomain)
    .map((entry) => entry.domain);
  const updatedLicense = await License.findOneAndUpdate(
    { _id: license._id, "activeDomains.domain": { $in: storedDomains } },
    { $pull: { activeDomains: { domain: { $in: storedDomains } } } },
    { new: true }
  );

  if (!updatedLicense) {
    return res.json({ success: true, message: "Domain was not activated on this license." });
  }

  await siteActivation.deactivateSite({ license: updatedLicense, domain: normalizedDomain, actorRole: "plugin", req }).catch(async () => {
    await LicenseActivation.create({
      licenseId: updatedLicense._id,
      domain: normalizedDomain,
      action: "deactivate",
      actorRole: "plugin",
      ipAddress: req.ip || "",
    });
  });

  await writeAuditLog({
    action: "license.domain_deactivated",
    targetType: "License",
    targetId: updatedLicense._id,
    metadata: { licenseKey: maskLicenseKey(updatedLicense.licenseKey), domain: normalizedDomain },
    ip: req.ip,
  });

  const responseLicense = await reloadLicenseForResponse(updatedLicense._id);
  return res.json(safeResponse(responseLicense, "Domain deactivated. Slot is now free."));
});

exports.check = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const { normalizedDomain, error: domainError, code: domainCode, policyError } = validateDomainInput(domain);
  if (domainError) {
    return failedValidation(res, { req, licenseKey, domain, reason: policyError || "invalid_domain", code: domainCode });
  }

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) {
    return failedValidation(res, { req, licenseKey, domain: normalizedDomain, reason: error, code });
  }

  const domainValid = isDomainActive(license, normalizedDomain);
  if (!domainValid) {
    return failedValidation(res, { req, license, domain: normalizedDomain, reason: "domain_not_activated" });
  }
  await siteActivation.validateSite({ license, input: { ...req.body, domain: normalizedDomain }, req }).catch(async () => {
    await siteActivation.upsertSiteActivation({ license, input: { ...req.body, domain: normalizedDomain }, actorRole: "plugin", req }).catch(() => {});
  });

  await auditPublicLicenseEvent({ req, action: "license.validated", license, domain: normalizedDomain });

  return res.json({
    ...safeResponse(license, "License is valid."),
    valid: true,
    domainValid,
  });
});

exports.replaceDomain = asyncHandler(async (req, res) => {
  const { licenseKey, oldDomain, newDomain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!oldDomain) throw new AppError("oldDomain is required.", 422);
  if (!newDomain) throw new AppError("newDomain is required.", 422);

  const normOld = normalizeDomain(oldDomain);
  const { normalizedDomain: normNew, error: domainError, code: domainCode } = validateDomainInput(newDomain);

  if (domainError) throw new AppError(domainError, domainCode);
  if (!isValidDomain(normOld)) throw new AppError("Invalid oldDomain format.", 422);
  if (normOld === normNew) throw new AppError("oldDomain and newDomain are the same.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) return res.status(code).json({ success: false, message: error });

  const oldIdx = license.activeDomains.findIndex((d) => normalizeDomain(d.domain) === normOld);
  if (oldIdx === -1) throw new AppError("oldDomain is not activated on this license.", 404);

  const newAlreadyActive = isDomainActive(license, normNew);
  if (!newAlreadyActive) {
    license.activeDomains[oldIdx] = { domain: normNew, activatedAt: new Date() };
  } else {
    license.activeDomains.splice(oldIdx, 1);
  }

  await license.save();

  await LicenseActivation.insertMany([
    { licenseId: license._id, domain: normOld, action: "deactivate", actorRole: "plugin", ipAddress: req.ip || "", note: `replaced by ${normNew}` },
    { licenseId: license._id, domain: normNew, action: "activate", actorRole: "plugin", ipAddress: req.ip || "", note: `replaced ${normOld}` },
  ]);

  await writeAuditLog({
    action: "license.domain_replaced",
    targetType: "License",
    targetId: license._id,
    metadata: { licenseKey: maskLicenseKey(license.licenseKey), oldDomain: normOld, newDomain: normNew },
    ip: req.ip,
  });

  return res.json(safeResponse(license, `Domain replaced: ${normOld} -> ${normNew}`));
});

exports.updateCheck = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug, currentVersion } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!currentVersion) throw new AppError("currentVersion is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const { normalizedDomain, error: domainError, code: domainCode, policyError } = validateDomainInput(domain);
  if (domainError) {
    return failedValidation(res, { req, licenseKey, domain, reason: policyError || "invalid_domain", code: domainCode });
  }

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) {
    return res.status(code).json({ success: false, message: "License is invalid or not entitled for this domain.", updateAvailable: false });
  }

  const domainActivated = isDomainActive(license, normalizedDomain);
  if (!domainActivated) {
    await auditPublicLicenseEvent({ req, action: "license.validation_failed", license, domain: normalizedDomain, reason: "domain_not_activated" });
    return res.status(403).json({ success: false, message: "License is invalid or not entitled for this domain.", updateAvailable: false });
  }
  await siteActivation.validateSite({ license, input: { ...req.body, domain: normalizedDomain }, req }).catch(async () => {
    await siteActivation.upsertSiteActivation({ license, input: { ...req.body, domain: normalizedDomain }, actorRole: "plugin", req }).catch(() => {});
  });

  const latest = await PluginVersion.findOne({
    productId: license.productId._id,
    isPublished: true,
  });

  if (!latest) {
    return res.json({
      success: true,
      updateAvailable: false,
      message: "No published version found for this product.",
      domainActivated,
    });
  }

  const updateAvailable = isNewerVersion(latest.versionNumber, currentVersion);

  return res.json({
    success: true,
    updateAvailable,
    domainActivated,
    currentVersion,
    latestVersion: latest.versionNumber,
    changelog: updateAvailable ? latest.changelog : "",
    minWpVersion: latest.minWpVersion || null,
    minPhpVersion: latest.minPhpVersion || null,
    releasedAt: latest.releasedAt,
  });
});

exports.heartbeat = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;
  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const { normalizedDomain, error: domainError, code: domainCode } = validateDomainInput(domain);
  if (domainError) throw new AppError(domainError, domainCode);

  const { license, error, code } = await resolveLicense(licenseKey.toUpperCase().trim(), productSlug);
  if (error) return res.status(code).json({ success: false, message: error });
  if (!isDomainActive(license, normalizedDomain)) {
    return res.status(403).json({ success: false, message: "Site is not activated on this license." });
  }

  const site = await siteActivation.heartbeat({ license, input: { ...req.body, domain: normalizedDomain }, req });
  return res.json({
    success: true,
    message: "Heartbeat recorded.",
    licenseStatus: license.status,
    environment: site.environment,
    pluginVersion: site.pluginVersion,
    lastHeartbeat: site.lastHeartbeatAt,
  });
});

exports._private = {
  limitExceededResponse,
  maskLicenseKey,
  safeResponse,
};
