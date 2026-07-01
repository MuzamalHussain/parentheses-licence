const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");
const PluginVersion = require("../models/PluginVersion");
const Product = require("../models/Product");
const { AppError } = require("../utils/errorHandler");
const { fileChecksum } = require("../utils/downloadToken");
const { writeAuditLog } = require("../utils/auditLog");
const { getConfig } = require("../config/env");
const { ZipValidationError, validatePluginZip } = require("../utils/pluginZipValidator");

function logUploadValidation(status, details) {
  const logger = status === "accepted" ? console.log : console.warn;
  logger("[Plugin Upload Security]", {
    status,
    productId: details.productId,
    versionNumber: details.versionNumber,
    reasonCode: details.reasonCode,
    fileSizeBytes: details.fileSizeBytes,
    validator: details.validator,
  });
}

// ─── GET /api/v1/admin/products/:productId/versions ─────────────────────────
exports.getVersions = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw new AppError("Product not found.", 404);

  // Versions-per-product is bounded by release cadence, but a hard cap is
  // kept as a defense-in-depth measure against unbounded growth.
  const versions = await PluginVersion.find({ productId: req.params.productId })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("uploadedBy", "name email");

  res.json({ success: true, data: versions });
});

// ─── GET /api/v1/admin/products/:productId/versions/:id ─────────────────────
exports.getVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);
  res.json({ success: true, data: version });
});

// ─── POST /api/v1/admin/products/:productId/versions ─────────────────────────
// multipart/form-data: file (zip) + versionNumber + changelog + minWpVersion + minPhpVersion
exports.uploadVersion = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) {
    if (req.file) fs.unlink(req.file.path, () => {});
    throw new AppError("Product not found.", 404);
  }

  if (!req.file) throw new AppError("A .zip file is required.", 422);

  const { versionNumber, changelog, minWpVersion, minPhpVersion } = req.body;

  if (!versionNumber || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(versionNumber)) {
    fs.unlink(req.file.path, () => {});
    throw new AppError("versionNumber must be valid semver, e.g. 1.4.2", 422);
  }

  // Reject duplicate version for this product
  const exists = await PluginVersion.findOne({ productId: req.params.productId, versionNumber });
  if (exists) {
    fs.unlink(req.file.path, () => {});
    throw new AppError(`Version ${versionNumber} already exists for this product.`, 409);
  }

  const config = getConfig();
  try {
    const validation = validatePluginZip(req.file.path, {
      expectedSlug: product.slug,
      expectedVersion: versionNumber,
      maxFiles: config.downloads.pluginZip.maxFiles,
      maxUncompressedBytes: config.downloads.pluginZip.maxUncompressedBytes,
      maxCompressionRatio: config.downloads.pluginZip.maxCompressionRatio,
    });

    logUploadValidation("accepted", {
      productId: req.params.productId,
      versionNumber,
      fileSizeBytes: req.file.size,
      validator: {
        rootFolder: validation.rootFolder,
        mainPluginFile: validation.mainPluginFile,
        fileCount: validation.fileCount,
        totalUncompressedBytes: validation.totalUncompressedBytes,
        compressionRatio: Number(validation.compressionRatio.toFixed(2)),
      },
    });
  } catch (err) {
    if (!(err instanceof ZipValidationError)) throw err;

    logUploadValidation(config.features.ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT ? "rejected" : "warned", {
      productId: req.params.productId,
      versionNumber,
      reasonCode: err.code,
      fileSizeBytes: req.file.size,
      validator: err.metadata || {},
    });

    if (config.features.ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT) {
      fs.unlink(req.file.path, () => {});
      throw new AppError(err.message, err.statusCode || 422);
    }
  }

  const checksum = await fileChecksum(req.file.path);

  const version = await PluginVersion.create({
    productId: req.params.productId,
    versionNumber,
    changelog: changelog || "",
    zipFilePath: req.file.path,
    fileSizeBytes: req.file.size,
    originalFileName: req.file.originalname,
    checksum,
    minWpVersion: minWpVersion || "",
    minPhpVersion: minPhpVersion || "",
    uploadedBy: req.user._id,
    isPublished: false,
  });

  await writeAuditLog({
    actor: req.user, action: "plugin_version.uploaded",
    targetType: "PluginVersion", targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber, fileSizeBytes: req.file.size },
    ip: req.ip,
  });

  res.status(201).json({ success: true, message: "Version uploaded. Publish it to make it available to customers.", data: version });
});

// ─── PATCH /api/v1/admin/products/:productId/versions/:id ────────────────────
// Update changelog / compatibility metadata (not the file itself — upload a new version for that)
exports.updateVersion = asyncHandler(async (req, res) => {
  const allowed = ["changelog", "minWpVersion", "minPhpVersion"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const version = await PluginVersion.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    updates,
    { new: true, runValidators: true }
  );
  if (!version) throw new AppError("Version not found.", 404);

  res.json({ success: true, message: "Version updated.", data: version });
});

// ─── POST /api/v1/admin/products/:productId/versions/:id/publish ─────────────
// Publishing a version automatically unpublishes all other versions of this
// product — "latest" is always exactly one version, simplifying update-check logic.
exports.publishVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);

  await PluginVersion.updateMany(
    { productId: req.params.productId, _id: { $ne: version._id } },
    { isPublished: false }
  );

  version.isPublished = true;
  version.releasedAt = version.releasedAt || new Date();
  await version.save();

  await writeAuditLog({
    actor: req.user, action: "plugin_version.published",
    targetType: "PluginVersion", targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber: version.versionNumber },
    ip: req.ip,
  });

  res.json({ success: true, message: `Version ${version.versionNumber} is now live.`, data: version });
});

// ─── POST /api/v1/admin/products/:productId/versions/:id/unpublish ───────────
exports.unpublishVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    { isPublished: false },
    { new: true }
  );
  if (!version) throw new AppError("Version not found.", 404);

  await writeAuditLog({
    actor: req.user, action: "plugin_version.unpublished",
    targetType: "PluginVersion", targetId: version._id,
    metadata: { versionNumber: version.versionNumber }, ip: req.ip,
  });

  res.json({ success: true, message: "Version unpublished. No version is currently live for this product.", data: version });
});

// ─── POST /api/v1/admin/products/:productId/versions/:id/rollback ────────────
// "Rollback" = publish an older version again. Files are never deleted, so this
// is just publishVersion on a historical entry.
exports.rollbackToVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);

  await PluginVersion.updateMany(
    { productId: req.params.productId, _id: { $ne: version._id } },
    { isPublished: false }
  );
  version.isPublished = true;
  await version.save();

  await writeAuditLog({
    actor: req.user, action: "plugin_version.rolled_back",
    targetType: "PluginVersion", targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber: version.versionNumber },
    ip: req.ip,
  });

  res.json({ success: true, message: `Rolled back to version ${version.versionNumber}.`, data: version });
});

// ─── DELETE /api/v1/admin/products/:productId/versions/:id ───────────────────
// Hard delete — only allowed for unpublished versions, and only the DB record;
// admins are warned the file remains on disk (manual cleanup) to avoid breaking
// any download tokens that might still reference it mid-flight.
exports.deleteVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);
  if (version.isPublished) throw new AppError("Unpublish this version before deleting it.", 400);

  await version.deleteOne();

  await writeAuditLog({
    actor: req.user, action: "plugin_version.deleted",
    targetType: "PluginVersion", targetId: version._id,
    metadata: { versionNumber: version.versionNumber }, ip: req.ip,
  });

  res.json({ success: true, message: "Version record deleted." });
});
