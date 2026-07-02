const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");
const License = require("../models/License");
const PluginVersion = require("../models/PluginVersion");
const Download = require("../models/Download");
const { AppError } = require("../utils/errorHandler");
const { hashToken, generateRawToken } = require("../utils/downloadToken");
const { writeAuditLog } = require("../utils/auditLog");
const licenseEngineConfig = require("../config/licenseEngine");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");

const TOKEN_TTL_MS = licenseEngineConfig.downloads.customerTokenTtlMs; // single-use

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/downloads/request
// Body: { licenseId, pluginVersionId }  (omit pluginVersionId to get latest published)
// Validates entitlement, returns a short-lived single-use download URL.
// ─────────────────────────────────────────────────────────────────────────────
exports.requestDownload = asyncHandler(async (req, res) => {
  const { licenseId } = req.body;
  let { pluginVersionId } = req.body;

  if (!licenseId) throw new AppError("licenseId is required.", 422);

  const license = await License.findOne({ _id: licenseId, userId: req.user._id }).populate("productId", "slug status");
  if (!license) throw new AppError("License not found.", 404);
  if (license.status !== "active") throw new AppError(`Your license is ${license.status}. Contact support for access.`, 403);
  if (license.expiresAt && new Date() > license.expiresAt) throw new AppError("Your license has expired.", 403);
  if (!license.productId || license.productId.status === "archived") throw new AppError("Product is no longer available.", 403);

  let version;
  if (pluginVersionId) {
    version = await PluginVersion.findOne({ _id: pluginVersionId, productId: license.productId, isPublished: true });
    if (!version) throw new AppError("That version is not available.", 404);
  } else {
    version = await PluginVersion.findOne({ productId: license.productId, isPublished: true }).sort({ createdAt: -1 });
    if (!version) throw new AppError("No published version is available for this product yet.", 404);
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await Download.create({
    userId: req.user._id,
    licenseId: license._id,
    pluginVersionId: version._id,
    tokenHash: hashToken(rawToken),
    expiresAt,
    ipAddress: req.ip || "",
  });

  await writeAuditLog({
    actor: req.user,
    action: "license.download_authorized",
    targetType: "License",
    targetId: license._id,
    metadata: { pluginVersionId: version._id, version: version.versionNumber },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      downloadUrl: `/api/v1/downloads/file/${rawToken}`,
      expiresAt,
      version: { id: version._id, versionNumber: version.versionNumber, changelog: version.changelog },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/downloads/file/:token
// Single-use, expiring. Streams the actual ZIP file.
// No JWT required here — the token itself is the bearer credential (it's
// short-lived, single-use, and was only ever issued to an authenticated,
// entitled user one step earlier).
// ─────────────────────────────────────────────────────────────────────────────
exports.serveFile = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const tokenHash = hashToken(token);

  const download = await Download.findOne({ tokenHash, purpose: "customer_download" });

  if (!download) {
    return res.status(403).json({ success: false, message: "This download link is invalid or has expired." });
  }
  if (download.usedAt) {
    return res.status(403).json({ success: false, message: "This download link has already been used. Request a new one." });
  }
  if (new Date() > download.expiresAt) {
    return res.status(403).json({ success: false, message: "This download link has expired. Request a new one." });
  }

  const version = await PluginVersion.findById(download.pluginVersionId);
  if (!version || !fs.existsSync(version.zipFilePath)) {
    return res.status(404).json({ success: false, message: "The requested file is no longer available." });
  }

  // Re-validate entitlement at download time too (license could've been
  // suspended/revoked in the gap between token request and actual download).
  const license = await License.findById(download.licenseId).populate("productId", "slug status");
  if (!license || license.status !== "active" || (license.expiresAt && new Date() > license.expiresAt)) {
    return res.status(403).json({ success: false, message: "Your license is no longer active." });
  }
  if (!license.productId || license.productId.status === "archived") {
    return res.status(403).json({ success: false, message: "Product is no longer available." });
  }
  if (!version.isPublished || version.productId.toString() !== license.productId._id.toString()) {
    return res.status(403).json({ success: false, message: "Your license is not entitled to this file." });
  }

  // Mark used BEFORE streaming — prevents replay even if the stream is interrupted
  const consumed = await Download.findOneAndUpdate(
    { _id: download._id, usedAt: null, expiresAt: { $gt: new Date() }, purpose: "customer_download" },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!consumed) {
    return res.status(403).json({ success: false, message: "This download link has already been used. Request a new one." });
  }

  await writeAuditLog({
    action: "license.download_completed",
    targetType: "License",
    targetId: license._id,
    metadata: { pluginVersionId: version._id, version: version.versionNumber },
    ip: req.ip,
  });

  const filename = `${version.originalFileName || `plugin-v${version.versionNumber}.zip`}`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const stream = fs.createReadStream(version.zipFilePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ success: false, message: "Error streaming file." });
  });
  stream.pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/downloads/history — customer's own past downloads
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyDownloadHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const [downloads, total] = await Promise.all([
    Download.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("pluginVersionId", "versionNumber")
      .populate("licenseId", "licenseKey")
      .lean(),
    Download.countDocuments({ userId: req.user._id }),
  ]);

  res.json({
    success: true,
    data: downloads,
    pagination: paginationMeta({ page, limit, total }),
  });
});
