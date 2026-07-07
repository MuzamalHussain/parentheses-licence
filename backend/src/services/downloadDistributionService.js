const crypto = require("crypto");
const path = require("path");
const License = require("../models/License");
const PluginVersion = require("../models/PluginVersion");
const Download = require("../models/Download");
const { AppError } = require("../utils/errorHandler");
const { hashToken } = require("../utils/downloadToken");
const { writeAuditLog } = require("../utils/auditLog");
const licenseEngineConfig = require("../config/licenseEngine");
const { getConfig } = require("../config/env");
const { getStorageAdapter } = require("./storageService");
const {
  markExpiredIfNeeded,
  assertEntitlement,
  entitlementSummary,
} = require("./licenseLifecycleService");

const CUSTOMER_PURPOSE = "customer_download";
const ASSET_TYPES = ["plugin_zip", "documentation_pdf", "release_notes", "checksum", "developer_package"];
const CHANNELS = ["stable", "release_candidate", "beta", "alpha", "internal"];

function isPast(dateValue) {
  return Boolean(dateValue && new Date() > new Date(dateValue));
}

function tokenSecret() {
  return getConfig().auth.accessSecret;
}

function signPayload(payload) {
  return crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

function createSignedToken(expiresAt) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(expiresAt).getTime();
  const payload = `${nonce}.${expires}`;
  return `${payload}.${signPayload(payload)}`;
}

function verifySignedToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { valid: false, reason: "invalid_signature" };
  const [nonce, expires, signature] = parts;
  if (!nonce || !expires || !signature) return { valid: false, reason: "invalid_signature" };
  const expected = signPayload(`${nonce}.${expires}`);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { valid: false, reason: "invalid_signature" };
  }
  if (Date.now() > Number(expires)) return { valid: false, reason: "expired" };
  return { valid: true };
}

function parseUserAgent(userAgent = "") {
  const ua = String(userAgent);
  const browser =
    ua.includes("Edg/") ? "Edge" :
    ua.includes("Chrome/") ? "Chrome" :
    ua.includes("Firefox/") ? "Firefox" :
    ua.includes("Safari/") ? "Safari" :
    ua.includes("WordPress") ? "WordPress" :
    "Unknown";
  const platform =
    ua.includes("Windows") ? "Windows" :
    ua.includes("Mac OS") ? "macOS" :
    ua.includes("Linux") ? "Linux" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") || ua.includes("iPad") ? "iOS" :
    "Unknown";
  return { browser, platform };
}

function eligibleChannelsFor(license, product) {
  const explicit = Array.isArray(license.allowedReleaseChannels) ? license.allowedReleaseChannels.filter(Boolean) : [];
  const channels = new Set(explicit.length ? explicit : ["stable"]);
  if (license?.entitlements?.betaChannel) channels.add("beta");
  if (product?.defaultReleaseChannel === "beta" || product?.betaEnabled) channels.add("beta");
  if (product?.defaultReleaseChannel === "alpha" || product?.alphaEnabled) channels.add("alpha");
  if (channels.has("beta")) channels.add("release_candidate");
  return [...channels].filter((channel) => CHANNELS.includes(channel));
}

function normalizeAsset(version, assetType = "plugin_zip") {
  const selected = Array.isArray(version.assets)
    ? version.assets.find((asset) => asset.type === assetType && asset.path)
    : null;
  if (selected) return selected;
  if (assetType !== "plugin_zip") return null;
  return {
    type: "plugin_zip",
    storageProvider: "local",
    path: version.zipFilePath,
    fileName: version.originalFileName || `plugin-v${version.versionNumber}.zip`,
    contentType: "application/zip",
    fileSizeBytes: version.fileSizeBytes || 0,
    checksumSha256: version.checksum || "",
    checksumMd5: version.checksumMd5 || "",
  };
}

async function recordDenied({ user, license, version, reason, req, assetType = "plugin_zip" }) {
  const token = createSignedToken(new Date(Date.now() + 60 * 1000));
  const userAgent = req?.headers?.["user-agent"] || "";
  const ua = parseUserAgent(userAgent);
  await Download.create({
    userId: user?._id || license?.userId,
    licenseId: license?._id,
    pluginVersionId: version?._id,
    productId: license?.productId?._id || license?.productId || version?.productId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 1000),
    purpose: CUSTOMER_PURPOSE,
    assetType,
    releaseChannel: version?.releaseChannel || "stable",
    status: "denied",
    deniedReason: reason,
    ipAddress: req?.ip || "",
    userAgent,
    browser: ua.browser,
    platform: ua.platform,
  }).catch(() => {});
}

async function logDownload({ actor, action, license, version, req, metadata = {} }) {
  await writeAuditLog({
    actor,
    action,
    targetType: "License",
    targetId: license?._id || null,
    metadata: {
      pluginVersionId: version?._id,
      version: version?.versionNumber,
      releaseChannel: version?.releaseChannel,
      ...metadata,
    },
    ip: req?.ip,
  });
}

async function resolveVersion({ license, pluginVersionId, releaseChannel }) {
  const productId = license.productId._id || license.productId;
  const eligibleChannels = eligibleChannelsFor(license, license.productId);
  const requestedChannel = releaseChannel || null;
  if (requestedChannel && !eligibleChannels.includes(requestedChannel)) {
    throw new AppError("Your license is not eligible for that release channel.", 403);
  }
  const channelFilter = requestedChannel ? [requestedChannel] : eligibleChannels;

  if (pluginVersionId) {
    const version = await PluginVersion.findOne({ _id: pluginVersionId, productId, isPublished: true });
    if (!version) throw new AppError("That version is not available.", 404);
    if (!channelFilter.includes(version.releaseChannel)) {
      throw new AppError("Your license is not eligible for that release channel.", 403);
    }
    return version;
  }

  const version = await PluginVersion.findOne({
    productId,
    isPublished: true,
    releaseChannel: { $in: channelFilter },
  }).sort({ releasedAt: -1, createdAt: -1 });
  if (!version) throw new AppError("No eligible published version is available for this product yet.", 404);
  return version;
}

async function enforceLimits({ license, version }) {
  const configured = licenseEngineConfig.downloads;
  const limits = license.downloadLimits || {};
  const perLicense = limits.perLicense || configured.perLicenseLimit;
  const perVersion = limits.perVersion || configured.perVersionLimit;
  const perDay = limits.perDay || configured.perDayLimit;
  const base = { licenseId: license._id, purpose: CUSTOMER_PURPOSE, status: "completed" };

  if (perLicense > 0 && await Download.countDocuments(base) >= perLicense) {
    throw new AppError("Download limit reached for this license.", 403);
  }
  if (perVersion > 0 && await Download.countDocuments({ ...base, pluginVersionId: version._id }) >= perVersion) {
    throw new AppError("Download limit reached for this version.", 403);
  }
  if (perDay > 0) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    if (await Download.countDocuments({ ...base, createdAt: { $gte: since } }) >= perDay) {
      throw new AppError("Daily download limit reached for this license.", 403);
    }
  }
}

async function validateLicense({ userId, licenseId }) {
  const license = await License.findOne({ _id: licenseId, userId }).populate("productId", "name slug status defaultReleaseChannel betaEnabled alphaEnabled downloadEnabled");
  if (!license) throw new AppError("License not found.", 404);
  await markExpiredIfNeeded(license);
  assertEntitlement(license, "download", `Your license is ${license.status}. Contact support for access.`);
  if (!license.productId || license.productId.status === "archived") throw new AppError("Product is no longer available.", 403);
  if (license.productId.downloadEnabled === false) throw new AppError("Downloads are disabled for this product.", 403);
  return license;
}

async function authorizeCustomerDownload({ user, licenseId, pluginVersionId, releaseChannel, assetType = "plugin_zip", req }) {
  if (!licenseId) throw new AppError("licenseId is required.", 422);
  if (!ASSET_TYPES.includes(assetType)) throw new AppError("assetType is invalid.", 422);

  await logDownload({ actor: user, action: "download.requested", req, metadata: { licenseId, pluginVersionId, assetType } });

  let license;
  let version;
  try {
    license = await validateLicense({ userId: user._id, licenseId });
    version = await resolveVersion({ license, pluginVersionId, releaseChannel });
    await enforceLimits({ license, version });
  } catch (err) {
    await recordDenied({ user, license, version, reason: err.message, req, assetType });
    await logDownload({ actor: user, action: "download.denied", license, version, req, metadata: { reason: err.message, assetType } });
    throw err;
  }

  const asset = normalizeAsset(version, assetType);
  if (!asset) throw new AppError("That asset is not available for this release.", 404);

  const expiresAt = new Date(Date.now() + licenseEngineConfig.downloads.customerTokenTtlMs);
  const token = createSignedToken(expiresAt);
  const userAgent = req?.headers?.["user-agent"] || "";
  const ua = parseUserAgent(userAgent);

  await Download.create({
    userId: user._id,
    licenseId: license._id,
    pluginVersionId: version._id,
    productId: license.productId._id,
    tokenHash: hashToken(token),
    expiresAt,
    purpose: CUSTOMER_PURPOSE,
    assetType: asset.type,
    assetPath: asset.path || "",
    fileName: asset.fileName || "",
    fileSizeBytes: asset.fileSizeBytes || version.fileSizeBytes || 0,
    checksumSha256: asset.checksumSha256 || version.checksum || "",
    checksumMd5: asset.checksumMd5 || version.checksumMd5 || "",
    releaseChannel: version.releaseChannel,
    status: "authorized",
    ipAddress: req?.ip || "",
    userAgent,
    browser: ua.browser,
    platform: ua.platform,
  });

  await logDownload({ actor: user, action: "download.authorized", license, version, req, metadata: { assetType: asset.type } });
  await logDownload({ actor: user, action: "license.download_authorized", license, version, req, metadata: { assetType: asset.type } });

  return {
    downloadUrl: `/api/v1/downloads/file/${token}`,
    expiresAt,
    version: {
      id: version._id,
      versionNumber: version.versionNumber,
      changelog: version.changelog,
      releaseChannel: version.releaseChannel,
      releasedAt: version.releasedAt,
      releaseDate: version.releaseDate,
      checksum: version.checksum || "",
      checksumMd5: version.checksumMd5 || "",
      fileSizeBytes: version.fileSizeBytes || 0,
      fileName: asset.fileName || version.originalFileName || "",
    },
  };
}

async function consumeCustomerDownload({ token, req, res }) {
  const signature = verifySignedToken(token);
  if (!signature.valid) {
    const legacyDownload = await Download.findOne({ tokenHash: hashToken(token), purpose: CUSTOMER_PURPOSE });
    if (legacyDownload?.usedAt) {
      return { statusCode: 403, body: { success: false, message: "This download link has already been used. Request a new one." } };
    }
    await logDownload({ action: signature.reason === "expired" ? "download.expired_url" : "download.invalid_signature", req });
    return { statusCode: 403, body: { success: false, message: signature.reason === "expired" ? "This download link has expired. Request a new one." : "This download link is invalid or has expired." } };
  }

  const download = await Download.findOne({ tokenHash: hashToken(token), purpose: CUSTOMER_PURPOSE });
  if (!download) {
    await logDownload({ action: "download.invalid_signature", req });
    return { statusCode: 403, body: { success: false, message: "This download link is invalid or has expired." } };
  }
  if (download.usedAt && licenseEngineConfig.downloads.singleUse) {
    return { statusCode: 403, body: { success: false, message: "This download link has already been used. Request a new one." } };
  }
  if (new Date() > download.expiresAt) {
    download.status = "expired";
    await download.save();
    await logDownload({ action: "download.expired_url", req, metadata: { downloadId: download._id } });
    return { statusCode: 403, body: { success: false, message: "This download link has expired. Request a new one." } };
  }

  const [license, version] = await Promise.all([
    License.findById(download.licenseId).populate("productId", "slug status defaultReleaseChannel betaEnabled alphaEnabled downloadEnabled"),
    PluginVersion.findById(download.pluginVersionId),
  ]);

  if (!license) {
    await logDownload({ action: "download.denied", license, version, req, metadata: { reason: "license_missing_at_download" } });
    return { statusCode: 403, body: { success: false, message: "Your license is no longer active." } };
  }
  await markExpiredIfNeeded(license);
  if (!entitlementSummary(license).canDownload) {
    if (license) await markExpiredIfNeeded(license);
    await logDownload({ action: "download.denied", license, version, req, metadata: { reason: "license_inactive_at_download" } });
    return { statusCode: 403, body: { success: false, message: "Your license is no longer active." } };
  }
  if (!license.productId || license.productId.status === "archived" || license.productId.downloadEnabled === false) {
    return { statusCode: 403, body: { success: false, message: "Product is no longer available." } };
  }
  if (!version || !version.isPublished || version.productId.toString() !== license.productId._id.toString()) {
    return { statusCode: 403, body: { success: false, message: "Your license is not entitled to this file." } };
  }
  if (!eligibleChannelsFor(license, license.productId).includes(version.releaseChannel)) {
    return { statusCode: 403, body: { success: false, message: "Your license is not entitled to this release channel." } };
  }

  const asset = normalizeAsset(version, download.assetType || "plugin_zip");
  const storage = getStorageAdapter(asset?.storageProvider);
  const stat = asset ? await storage.stat(asset) : { exists: false };
  if (!asset || !stat.exists) {
    download.status = "missing_file";
    await download.save();
    await logDownload({ action: "download.missing_file", license, version, req, metadata: { assetType: download.assetType } });
    return { statusCode: 404, body: { success: false, message: "The requested file is no longer available." } };
  }

  const update = {
    status: "completed",
    fileSizeBytes: stat.size || download.fileSizeBytes,
    assetPath: asset.path,
    fileName: asset.fileName || download.fileName,
    checksumSha256: asset.checksumSha256 || download.checksumSha256,
    checksumMd5: asset.checksumMd5 || download.checksumMd5,
  };
  if (licenseEngineConfig.downloads.singleUse) update.usedAt = new Date();

  const consumed = await Download.findOneAndUpdate(
    { _id: download._id, ...(licenseEngineConfig.downloads.singleUse ? { usedAt: null } : {}), expiresAt: { $gt: new Date() }, purpose: CUSTOMER_PURPOSE },
    { $set: update },
    { new: true }
  );
  if (!consumed) {
    return { statusCode: 403, body: { success: false, message: "This download link has already been used. Request a new one." } };
  }

  await logDownload({ action: "download.completed", license, version, req, metadata: { assetType: download.assetType } });
  await logDownload({ action: "license.download_completed", license, version, req, metadata: { assetType: download.assetType } });

  const filename = path.basename(asset.fileName || download.fileName || `plugin-v${version.versionNumber}.zip`);
  res.setHeader("Content-Type", stat.contentType || "application/octet-stream");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (asset.checksumSha256 || version.checksum) res.setHeader("X-Checksum-SHA256", asset.checksumSha256 || version.checksum);
  if (asset.checksumMd5 || version.checksumMd5) res.setHeader("X-Checksum-MD5", asset.checksumMd5 || version.checksumMd5);

  return { stream: storage.createReadStream(asset) };
}

function publicVersionPayload(version) {
  return {
    _id: version._id,
    versionNumber: version.versionNumber,
    versionName: version.versionName,
    releaseChannel: version.releaseChannel,
    changelog: version.changelog,
    releaseNotes: version.releaseNotes,
    releasedAt: version.releasedAt,
    releaseDate: version.releaseDate,
    isPublished: version.isPublished,
    isLatest: version.isLatest,
    fileSizeBytes: version.fileSizeBytes,
    checksum: version.checksum || "",
    checksumMd5: version.checksumMd5 || "",
    originalFileName: version.originalFileName || "",
  };
}

module.exports = {
  CUSTOMER_PURPOSE,
  createSignedToken,
  verifySignedToken,
  eligibleChannelsFor,
  normalizeAsset,
  authorizeCustomerDownload,
  consumeCustomerDownload,
  publicVersionPayload,
};
