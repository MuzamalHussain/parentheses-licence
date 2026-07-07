const asyncHandler = require("express-async-handler");
const Download = require("../models/Download");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");
const {
  authorizeCustomerDownload,
  consumeCustomerDownload,
} = require("../services/downloadDistributionService");

exports.requestDownload = asyncHandler(async (req, res) => {
  const data = await authorizeCustomerDownload({
    user: req.user,
    licenseId: req.body.licenseId,
    pluginVersionId: req.body.pluginVersionId,
    releaseChannel: req.body.releaseChannel,
    assetType: req.body.assetType || "plugin_zip",
    req,
  });

  res.status(201).json({ success: true, data });
});

exports.serveFile = asyncHandler(async (req, res) => {
  const result = await consumeCustomerDownload({ token: req.params.token, req, res });
  if (result.body) return res.status(result.statusCode).json(result.body);

  result.stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ success: false, message: "Error streaming file." });
  });
  return result.stream.pipe(res);
});

exports.getMyDownloadHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const [downloads, total] = await Promise.all([
    Download.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("pluginVersionId", "versionNumber releaseChannel releasedAt productId")
      .populate("productId", "name slug")
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

exports.getAdminDownloadHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.adminMaxLimit,
  });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.releaseChannel) filter.releaseChannel = req.query.releaseChannel;
  if (req.query.purpose) filter.purpose = req.query.purpose;

  const [downloads, total] = await Promise.all([
    Download.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email")
      .populate("productId", "name slug")
      .populate("pluginVersionId", "versionNumber releaseChannel")
      .populate("licenseId", "licenseKey status")
      .lean(),
    Download.countDocuments(filter),
  ]);

  res.json({ success: true, data: downloads, pagination: paginationMeta({ page, limit, total }) });
});
