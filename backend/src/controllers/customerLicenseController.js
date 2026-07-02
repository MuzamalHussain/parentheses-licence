const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");

const populateLicense = (query) =>
  query
    .populate("productId", "name slug")
    .populate("planId",    "name allowedSites priceUSD priceLocal renewalType durationDays");

// GET /api/v1/licenses  — customer's own licenses
exports.getMyLicenses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [licenses, total] = await Promise.all([
    populateLicense(License.find(filter)).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
    License.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: licenses,
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/licenses/:id — single license (customer's own)
exports.getMyLicense = asyncHandler(async (req, res) => {
  const license = await populateLicense(
    License.findOne({ _id: req.params.id, userId: req.user._id })
  );
  if (!license) throw new AppError("License not found.", 404);
  res.json({ success: true, data: license });
});

// GET /api/v1/licenses/:id/activation-history
exports.getActivationHistory = asyncHandler(async (req, res) => {
  // Ensure license belongs to this customer
  const license = await License.exists({ _id: req.params.id, userId: req.user._id });
  if (!license) throw new AppError("License not found.", 404);

  const history = await LicenseActivation.find({ licenseId: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({ success: true, data: history });
});

// POST /api/v1/licenses/:id/deactivate-domain — customer self-service
exports.deactivateDomain = asyncHandler(async (req, res) => {
  const { domain } = req.body;
  if (!domain) throw new AppError("Domain is required.", 422);

  const license = await License.findOne({ _id: req.params.id, userId: req.user._id });
  if (!license) throw new AppError("License not found.", 404);
  if (license.status !== "active") throw new AppError("Only active licenses can be modified.", 400);

  const domainLower = normalizeDomain(domain);
  if (!isValidDomain(domainLower)) throw new AppError("Invalid domain format.", 422);

  const updatedLicense = await License.findOneAndUpdate(
    { _id: license._id, userId: req.user._id, "activeDomains.domain": domainLower },
    { $pull: { activeDomains: { domain: domainLower } } },
    { new: true }
  );
  if (!updatedLicense) throw new AppError("Domain is not activated on this license.", 404);

  await LicenseActivation.create({
    licenseId: updatedLicense._id,
    domain: domainLower,
    action: "deactivate",
    actorId: req.user._id,
    actorRole: "customer",
  });

  await writeAuditLog({
    actor: req.user,
    action: "license.domain_deactivated",
    targetType: "License",
    targetId: updatedLicense._id,
    metadata: { licenseKey: updatedLicense.licenseKey, domain: domainLower, actorRole: "customer" },
    ip: req.ip,
  });

  res.json({ success: true, message: "Domain deactivated. Slot is now free.", data: updatedLicense });
});

// GET /api/v1/licenses/summary — stats for customer dashboard cards
exports.getMySummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [statusCounts, activeDomainTotals, expiringInDays30] = await Promise.all([
    License.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    License.aggregate([
      { $match: { userId: req.user._id } },
      { $project: { activeDomainCount: { $size: "$activeDomains" } } },
      { $group: { _id: null, total: { $sum: "$activeDomainCount" } } },
    ]),
    License.countDocuments({
      userId: req.user._id,
      status: "active",
      expiresAt: { $gt: now, $lte: in30Days },
    }),
  ]);
  const totalLicenses = statusCounts.reduce((sum, item) => sum + item.count, 0);
  const summary = {
    totalLicenses,
    activeLicenses: statusCounts.find((item) => item._id === "active")?.count || 0,
    activeDomains: activeDomainTotals[0]?.total || 0,
    expiringInDays30,
  };

  res.json({ success: true, data: summary });
});
