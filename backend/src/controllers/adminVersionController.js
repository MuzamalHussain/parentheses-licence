const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const fs = require("fs");
const PluginVersion = require("../models/PluginVersion");
const Product = require("../models/Product");
const Download = require("../models/Download");
const { AppError } = require("../utils/errorHandler");
const { fileChecksum } = require("../utils/downloadToken");
const { writeAuditLog } = require("../utils/auditLog");
const { getConfig } = require("../config/env");
const { ZipValidationError, validatePluginZip } = require("../utils/pluginZipValidator");
const { logInfo, logWarn } = require("../utils/logger");

const VERSION_STATUSES = ["draft", "published", "hidden", "archived", "deprecated"];
const RELEASE_CHANNELS = ["stable", "release_candidate", "beta", "alpha", "internal", "deprecated"];
const CHANGELOG_FIELDS = ["newFeatures", "improvements", "bugFixes", "securityFixes", "breakingChanges", "developerNotes"];

function logUploadValidation(status, details) {
  const logger = status === "accepted" ? logInfo : logWarn;
  logger("plugin_upload_security.validation", {
    status,
    productId: details.productId,
    versionNumber: details.versionNumber,
    reasonCode: details.reasonCode,
    fileSizeBytes: details.fileSizeBytes,
    validator: details.validator,
  });
}

function validateEnum(value, allowed, field) {
  if (value && !allowed.includes(value)) throw new AppError(`${field} is invalid.`, 422);
}

function parseChangelogSections(body) {
  const changelogSections = {};
  for (const field of CHANGELOG_FIELDS) {
    if (body[`changelogSections.${field}`] !== undefined) changelogSections[field] = body[`changelogSections.${field}`];
    else if (body[field] !== undefined) changelogSections[field] = body[field];
  }
  return changelogSections;
}

function checksumFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function semverCompare(a, b) {
  const parse = (value) => String(value).split("-")[0].split(".").map((part) => Number(part) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return String(a).localeCompare(String(b));
}

function applyVersionFilters(req, filter) {
  if (req.query.status) filter.status = req.query.status;
  if (req.query.releaseChannel) filter.releaseChannel = req.query.releaseChannel;
  if (req.query.latest === "true") filter.isLatest = true;
  if (req.query.search) {
    const pattern = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { versionNumber: pattern },
      { versionName: pattern },
      { releaseChannel: pattern },
    ];
  }
}

async function attachDownloadCounts(versions) {
  if (!versions.length) return versions;
  const ids = versions.map((version) => version._id);
  const counts = await Download.aggregate([
    { $match: { pluginVersionId: { $in: ids }, usedAt: { $ne: null } } },
    { $group: { _id: "$pluginVersionId", count: { $sum: 1 } } },
  ]);
  const countByVersion = new Map(counts.map((row) => [row._id.toString(), row.count]));
  return versions.map((version) => ({
    ...version,
    downloadCount: countByVersion.get(version._id.toString()) || version.downloadCount || 0,
  }));
}

function buildVersionPayload({ req, product, file, checksumSha256, checksumMd5, validation }) {
  const status = req.body.status || "draft";
  const releaseChannel = req.body.releaseChannel || product.defaultReleaseChannel || "stable";
  validateEnum(status, VERSION_STATUSES, "status");
  validateEnum(releaseChannel, RELEASE_CHANNELS, "releaseChannel");
  return {
    productId: req.params.productId,
    versionNumber: req.body.versionNumber,
    versionName: req.body.versionName || "",
    status,
    releaseChannel,
    description: req.body.description || "",
    changelog: req.body.changelog || "",
    changelogSections: parseChangelogSections(req.body),
    releaseNotes: req.body.releaseNotes || "",
    zipFilePath: file.path,
    fileSizeBytes: file.size,
    originalFileName: file.originalname,
    checksum: checksumSha256,
    checksumMd5,
    minWpVersion: req.body.minWpVersion || product.minWpVersion || "",
    minPhpVersion: req.body.minPhpVersion || product.minPhpVersion || "",
    testedUpTo: req.body.testedUpTo || product.testedUpTo || "",
    pluginSlug: validation.rootFolder || product.pluginSlug || product.slug || "",
    uploadedBy: req.user._id,
    uploadedAt: new Date(),
    releaseDate: req.body.releaseDate ? new Date(req.body.releaseDate) : null,
    isPublished: status === "published",
    isLatest: false,
  };
}

async function recalculateLatest(productId) {
  const published = await PluginVersion.find({ productId, isPublished: true });
  const latest = published.sort((a, b) => semverCompare(b.versionNumber, a.versionNumber))[0];
  await PluginVersion.updateMany({ productId }, { isLatest: false });
  if (latest) {
    latest.isLatest = true;
    latest.status = "published";
    latest.releasedAt = latest.releasedAt || new Date();
    latest.releaseDate = latest.releaseDate || latest.releasedAt;
    await latest.save();
  }
  return latest || null;
}

async function publishOnlyVersion(productId, version) {
  await PluginVersion.updateMany(
    { productId, _id: { $ne: version._id } },
    { isPublished: false, isLatest: false }
  );
  version.isPublished = true;
  version.status = "published";
  version.releasedAt = version.releasedAt || new Date();
  version.releaseDate = version.releaseDate || version.releasedAt;
  await version.save();
  return recalculateLatest(productId);
}

exports.getVersions = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).select("_id").lean();
  if (!product) throw new AppError("Product not found.", 404);

  const filter = { productId: req.params.productId };
  applyVersionFilters(req, filter);

  const versions = await PluginVersion.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("uploadedBy", "name email")
    .lean();

  res.json({ success: true, data: await attachDownloadCounts(versions) });
});

exports.getVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId }).lean();
  if (!version) throw new AppError("Version not found.", 404);
  const [data] = await attachDownloadCounts([version]);
  res.json({ success: true, data });
});

exports.uploadVersion = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) {
    if (req.file) fs.unlink(req.file.path, () => {});
    throw new AppError("Product not found.", 404);
  }

  if (!req.file) throw new AppError("A .zip file is required.", 422);

  const { versionNumber } = req.body;
  if (!versionNumber || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(versionNumber)) {
    fs.unlink(req.file.path, () => {});
    throw new AppError("versionNumber must be valid semver, e.g. 1.4.2", 422);
  }

  validateEnum(req.body.status || "draft", VERSION_STATUSES, "status");
  validateEnum(req.body.releaseChannel || product.defaultReleaseChannel || "stable", RELEASE_CHANNELS, "releaseChannel");

  const exists = await PluginVersion.findOne({ productId: req.params.productId, versionNumber });
  if (exists) {
    fs.unlink(req.file.path, () => {});
    throw new AppError(`Version ${versionNumber} already exists for this product.`, 409);
  }

  const config = getConfig();
  let validation;
  try {
    validation = validatePluginZip(req.file.path, {
      expectedSlug: product.pluginSlug || product.slug,
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
    validation = { rootFolder: product.pluginSlug || product.slug };
  }

  const [checksumSha256, checksumMd5] = await Promise.all([
    fileChecksum(req.file.path),
    checksumFile(req.file.path, "md5"),
  ]);

  const version = await PluginVersion.create(buildVersionPayload({
    req,
    product,
    file: req.file,
    checksumSha256,
    checksumMd5,
    validation,
  }));

  if (version.isPublished) await publishOnlyVersion(req.params.productId, version);

  await writeAuditLog({
    actor: req.user,
    action: "plugin_version.uploaded",
    targetType: "PluginVersion",
    targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber, fileSizeBytes: req.file.size, releaseChannel: version.releaseChannel },
    ip: req.ip,
  });

  res.status(201).json({ success: true, message: "Version uploaded. Publish it to make it available to customers.", data: version });
});

exports.updateVersion = asyncHandler(async (req, res) => {
  if (req.body.status) validateEnum(req.body.status, VERSION_STATUSES, "status");
  if (req.body.releaseChannel) validateEnum(req.body.releaseChannel, RELEASE_CHANNELS, "releaseChannel");

  const allowed = [
    "versionName",
    "status",
    "releaseChannel",
    "description",
    "changelog",
    "releaseNotes",
    "minWpVersion",
    "minPhpVersion",
    "testedUpTo",
    "pluginSlug",
    "releaseDate",
  ];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });
  const changelogSections = parseChangelogSections(req.body);
  if (Object.keys(changelogSections).length) updates.changelogSections = changelogSections;
  if (updates.status === "published") {
    await PluginVersion.updateMany(
      { productId: req.params.productId, _id: { $ne: req.params.id } },
      { isPublished: false, isLatest: false }
    );
    updates.isPublished = true;
    updates.releasedAt = new Date();
    updates.releaseDate = updates.releaseDate || updates.releasedAt;
  } else if (updates.status && updates.status !== "published") {
    updates.isPublished = false;
    updates.isLatest = false;
  }

  const version = await PluginVersion.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    updates,
    { new: true, runValidators: true }
  );
  if (!version) throw new AppError("Version not found.", 404);
  await recalculateLatest(req.params.productId);

  res.json({ success: true, message: "Version updated.", data: version });
});

exports.publishVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);

  const latest = await publishOnlyVersion(req.params.productId, version);

  await writeAuditLog({
    actor: req.user,
    action: "plugin_version.published",
    targetType: "PluginVersion",
    targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber: version.versionNumber, isLatest: latest?._id?.toString() === version._id.toString() },
    ip: req.ip,
  });

  res.json({ success: true, message: `Version ${version.versionNumber} is now published.`, data: version });
});

exports.unpublishVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    { isPublished: false, isLatest: false, status: "hidden" },
    { new: true }
  );
  if (!version) throw new AppError("Version not found.", 404);
  await recalculateLatest(req.params.productId);

  await writeAuditLog({
    actor: req.user,
    action: "plugin_version.unpublished",
    targetType: "PluginVersion",
    targetId: version._id,
    metadata: { versionNumber: version.versionNumber },
    ip: req.ip,
  });

  res.json({ success: true, message: "Version unpublished. No version is currently live for this product unless another published version exists.", data: version });
});

exports.rollbackToVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);

  await publishOnlyVersion(req.params.productId, version);

  await writeAuditLog({
    actor: req.user,
    action: "plugin_version.rolled_back",
    targetType: "PluginVersion",
    targetId: version._id,
    metadata: { productId: req.params.productId, versionNumber: version.versionNumber },
    ip: req.ip,
  });

  res.json({ success: true, message: `Rolled back to version ${version.versionNumber}.`, data: version });
});

exports.deleteVersion = asyncHandler(async (req, res) => {
  const version = await PluginVersion.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!version) throw new AppError("Version not found.", 404);
  if (version.isPublished) throw new AppError("Unpublish this version before deleting it.", 400);

  await version.deleteOne();
  await recalculateLatest(req.params.productId);

  await writeAuditLog({
    actor: req.user,
    action: "plugin_version.deleted",
    targetType: "PluginVersion",
    targetId: version._id,
    metadata: { versionNumber: version.versionNumber },
    ip: req.ip,
  });

  res.json({ success: true, message: "Version record deleted." });
});
