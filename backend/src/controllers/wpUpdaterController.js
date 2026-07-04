const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");
const License = require("../models/License");
const PluginVersion = require("../models/PluginVersion");
const Download = require("../models/Download");
const { hashToken } = require("../utils/downloadToken");
const { createUpdaterToken, verifyUpdaterToken } = require("../utils/updaterToken");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { isNewerVersion } = require("../utils/semver");
const { writeAuditLog } = require("../utils/auditLog");
const { logInfo } = require("../utils/logger");
const licenseEngineConfig = require("../config/licenseEngine");

const TOKEN_TTL_MS = licenseEngineConfig.downloads.updaterTokenTtlMs;
const UPDATE_PURPOSE = "wordpress_update";

function isPast(dateValue) {
  return Boolean(dateValue && new Date() > new Date(dateValue));
}

function unauthorized(res, message = "License is invalid or not entitled to this update.") {
  return res.status(403).json({
    success: false,
    code: "license_invalid_or_not_entitled",
    message,
  });
}

function maskLicenseKey(licenseKey = "") {
  const compact = String(licenseKey).replace(/-/g, "");
  if (compact.length <= 8) return "****";
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

function packageUrl(req, token) {
  return `${req.protocol}://${req.get("host")}/api/wp/updater/download/${token}`;
}

function versionSort(sortable) {
  return sortable.sort((a, b) => (isNewerVersion(a.versionNumber, b.versionNumber) ? -1 : 1));
}

async function resolveEntitlement({ licenseKey, pluginSlug, normalizedDomain }) {
  const license = await License.findOne({ licenseKey })
    .populate("productId", "name slug status")
    .populate("planId", "name")
    .populate("userId", "_id status");

  if (!license) return { error: "invalid_license" };
  if (!license.userId) return { error: "customer_missing" };
  if (license.status !== "active") return { error: "inactive_license" };
  if (isPast(license.expiresAt)) return { error: "expired_license" };
  if (!license.productId || license.productId.slug !== pluginSlug) return { error: "not_entitled" };
  if (license.productId.status === "archived") return { error: "product_archived" };
  if (!license.activeDomains.some((entry) => entry.domain === normalizedDomain)) return { error: "domain_not_activated" };

  return { license };
}

async function latestPublishedVersion(productId) {
  const versions = await PluginVersion.find({ productId, isPublished: true });
  if (!versions.length) return null;
  return versionSort(versions)[0];
}

async function issueUpdaterDownload({ req, license, version, normalizedDomain }) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const rawToken = createUpdaterToken({ purpose: UPDATE_PURPOSE, expiresAt });

  await Download.create({
    userId: license.userId,
    licenseId: license._id,
    pluginVersionId: version._id,
    tokenHash: hashToken(rawToken),
    expiresAt,
    purpose: UPDATE_PURPOSE,
    domain: normalizedDomain,
    ipAddress: req.ip || "",
  });

  return { rawToken, expiresAt };
}

exports.check = asyncHandler(async (req, res) => {
  const {
    license_key: licenseKey,
    site_url: siteUrl,
    plugin_slug: pluginSlug,
    current_version: currentVersion,
  } = req.body;

  if (!licenseKey || !siteUrl || !pluginSlug || !currentVersion) {
    return res.status(422).json({ success: false, code: "invalid_request", message: "license_key, site_url, plugin_slug, and current_version are required." });
  }

  const normalizedDomain = normalizeDomain(siteUrl);
  if (!isValidDomain(normalizedDomain)) {
    return res.status(422).json({ success: false, code: "invalid_domain", message: "Invalid site_url." });
  }

  const normalizedLicenseKey = licenseKey.toUpperCase().trim();
  const normalizedPluginSlug = String(pluginSlug).trim().toLowerCase();

  logInfo("wp_updater.check_received", {
    status: "check_received",
    pluginSlug: normalizedPluginSlug,
    domain: normalizedDomain,
    license: maskLicenseKey(normalizedLicenseKey),
  });

  const { license, error } = await resolveEntitlement({
    licenseKey: normalizedLicenseKey,
    pluginSlug: normalizedPluginSlug,
    normalizedDomain,
  });
  if (error) {
    await writeAuditLog({
      action: "license.validation_failed",
      targetType: license ? "License" : "",
      targetId: license?._id || null,
      metadata: { pluginSlug: normalizedPluginSlug, domain: normalizedDomain, reason: error },
      ip: req.ip,
    });
    return unauthorized(res);
  }

  const latest = await latestPublishedVersion(license.productId._id);
  if (!latest || !isNewerVersion(latest.versionNumber, currentVersion)) {
    logInfo("wp_updater.no_update", {
      status: "no_update",
      pluginSlug: normalizedPluginSlug,
      domain: normalizedDomain,
      license: maskLicenseKey(normalizedLicenseKey),
    });
    return res.json({ success: true, update_available: false, message: "Plugin is up to date." });
  }

  const { rawToken, expiresAt } = await issueUpdaterDownload({
    req,
    license,
    version: latest,
    normalizedDomain,
  });

  logInfo("wp_updater.signed_url_issued", {
    status: "signed_url_issued",
    pluginSlug: normalizedPluginSlug,
    domain: normalizedDomain,
    license: maskLicenseKey(normalizedLicenseKey),
    version: latest.versionNumber,
  });

  await writeAuditLog({
    action: "license.download_authorized",
    targetType: "License",
    targetId: license._id,
    metadata: { purpose: UPDATE_PURPOSE, pluginSlug: normalizedPluginSlug, domain: normalizedDomain, version: latest.versionNumber },
    ip: req.ip,
  });

  return res.json({
    success: true,
    update_available: true,
    plugin_slug: normalizedPluginSlug,
    new_version: latest.versionNumber,
    requires: latest.minWpVersion || "",
    tested: "",
    requires_php: latest.minPhpVersion || "",
    package: packageUrl(req, rawToken),
    changelog: latest.changelog || "",
    release_notes: latest.changelog || "",
    checksum: latest.checksum || "",
    expires_at: expiresAt,
  });
});

exports.download = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const verification = verifyUpdaterToken(token, UPDATE_PURPOSE);
  if (!verification.valid) {
    return res.status(403).json({ success: false, message: "This update package link is invalid or has expired." });
  }

  const download = await Download.findOne({ tokenHash: hashToken(token), purpose: UPDATE_PURPOSE });
  if (!download) return res.status(403).json({ success: false, message: "This update package link is invalid or has expired." });
  if (download.usedAt) return res.status(403).json({ success: false, message: "This update package link has already been used." });
  if (new Date() > download.expiresAt) return res.status(403).json({ success: false, message: "This update package link has expired." });

  const [license, version] = await Promise.all([
    License.findById(download.licenseId).populate("productId", "slug status"),
    PluginVersion.findById(download.pluginVersionId),
  ]);

  if (!license || license.status !== "active" || isPast(license.expiresAt)) {
    return unauthorized(res, "License is no longer active.");
  }
  if (!version || !version.isPublished || version.productId.toString() !== license.productId._id.toString()) {
    return unauthorized(res, "License is not entitled to this package.");
  }
  if (!license.activeDomains.some((entry) => entry.domain === download.domain)) {
    return unauthorized(res, "Site is not activated for this license.");
  }

  const rawZipPath = version.zipFilePath || "";
  if (rawZipPath.split(/[\\/]+/).includes("..")) {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }

  const normalizedPath = path.normalize(rawZipPath);
  if (!normalizedPath) {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }
  if (path.extname(normalizedPath).toLowerCase() !== ".zip") {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }

  let stat;
  try {
    stat = fs.statSync(normalizedPath);
  } catch {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }
  if (!stat.isFile()) {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }

  const consumed = await Download.findOneAndUpdate(
    { _id: download._id, usedAt: null, expiresAt: { $gt: new Date() }, purpose: UPDATE_PURPOSE },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!consumed) {
    return res.status(403).json({ success: false, message: "This update package link has already been used." });
  }

  const filename = version.originalFileName || `${license.productId.slug || "plugin"}-${version.versionNumber}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filename)}"`);

  logInfo("wp_updater.download_completed", {
    status: "download_completed",
    pluginSlug: license.productId.slug,
    domain: download.domain,
    version: version.versionNumber,
  });

  await writeAuditLog({
    action: "license.download_completed",
    targetType: "License",
    targetId: license._id,
    metadata: { purpose: UPDATE_PURPOSE, pluginSlug: license.productId.slug, domain: download.domain, version: version.versionNumber },
    ip: req.ip,
  });

  const stream = fs.createReadStream(normalizedPath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ success: false, message: "Error streaming file." });
  });
  stream.pipe(res);
});
