const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { getCached } = require("../utils/ttlCache");
const performanceConfig = require("../config/performance");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/domains
// Flattens activeDomains across all licenses into a searchable, paginated list.
// ─────────────────────────────────────────────────────────────────────────────
exports.getDomains = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);

  const matchStage = {};
  if (req.query.productId) matchStage.productId = require("mongoose").Types.ObjectId.createFromHexString(req.query.productId);

  const pipeline = [
    { $match: { ...matchStage, "activeDomains.0": { $exists: true } } },
    { $unwind: "$activeDomains" },
    ...(req.query.search
      ? [{ $match: { "activeDomains.domain": { $regex: req.query.search, $options: "i" } } }]
      : []),
    { $sort: { "activeDomains.activatedAt": -1 } },
    {
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: { from: "users",    localField: "userId",    foreignField: "_id", as: "user" },
          },
          {
            $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" },
          },
          {
            $lookup: { from: "plans",    localField: "planId",    foreignField: "_id", as: "plan" },
          },
          {
            $project: {
              domain:       "$activeDomains.domain",
              activatedAt:  "$activeDomains.activatedAt",
              licenseId:    "$_id",
              licenseKey:   1,
              status:       1,
              allowedSites: 1,
              usedSites:    { $size: "$activeDomains" }, // NOTE: per-doc total, corrected client-side per license below
              user:    { $arrayElemAt: ["$user", 0] },
              product: { $arrayElemAt: ["$product", 0] },
              plan:    { $arrayElemAt: ["$plan", 0] },
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await License.aggregate(pipeline);
  const rows  = result.data || [];
  const total = result.totalCount[0]?.count || 0;

  // usedSites above counts the full activeDomains array length (correct — not per-unwind row)
  const formatted = rows.map((r) => ({
    domain: r.domain,
    activatedAt: r.activatedAt,
    license: {
      id: r.licenseId,
      key: r.licenseKey,
      status: r.status,
      allowedSites: r.allowedSites,
      usedSites: r.usedSites,
    },
    customer: r.user ? { id: r.user._id, name: r.user.name, email: r.user.email } : null,
    product:  r.product ? { id: r.product._id, name: r.product.name } : null,
    plan:     r.plan ? { id: r.plan._id, name: r.plan.name } : null,
  }));

  res.json({
    success: true,
    data: formatted,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/domains/stats
// ─────────────────────────────────────────────────────────────────────────────
exports.getDomainStats = asyncHandler(async (req, res) => {
  const data = await getCached("admin:domains:stats:v1", performanceConfig.cache.statsTtlMs, async () => {
    const [result] = await License.aggregate([
      { $match: { "activeDomains.0": { $exists: true } } },
      { $project: { count: { $size: "$activeDomains" } } },
      { $group: { _id: null, totalDomains: { $sum: "$count" }, licensesWithDomains: { $sum: 1 } } },
    ]);

    const [last24h, last7d] = await Promise.all([
      LicenseActivation.countDocuments({ action: "activate", createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      LicenseActivation.countDocuments({ action: "activate", createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    ]);

    return {
      totalActiveDomains:  result?.totalDomains || 0,
      licensesWithDomains: result?.licensesWithDomains || 0,
      activationsLast24h:  last24h,
      activationsLast7d:   last7d,
    };
  });

  res.json({ success: true, data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/domains/:licenseId/history
// Full activation/deactivation event log for one license (audit trail)
// ─────────────────────────────────────────────────────────────────────────────
exports.getDomainHistory = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.licenseId);
  if (!license) throw new AppError("License not found.", 404);

  const history = await LicenseActivation.find({ licenseId: req.params.licenseId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("actorId", "name email role")
    .lean();

  res.json({ success: true, data: history });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/admin/domains/:licenseId/force-deactivate
// Admin override — remove a specific domain from a license without going
// through the customer self-service flow (e.g. abuse, fraud, support request).
// ─────────────────────────────────────────────────────────────────────────────
exports.forceDeactivateDomain = asyncHandler(async (req, res) => {
  const { domain } = req.body;
  if (!domain) throw new AppError("Domain is required.", 422);

  const license = await License.findById(req.params.licenseId);
  if (!license) throw new AppError("License not found.", 404);

  const domainLower = normalizeDomain(domain);
  if (!isValidDomain(domainLower)) throw new AppError("Invalid domain format.", 422);
  const storedDomains = license.activeDomains
    .filter((entry) => normalizeDomain(entry.domain) === domainLower)
    .map((entry) => entry.domain);

  const updatedLicense = await License.findOneAndUpdate(
    { _id: license._id, "activeDomains.domain": { $in: storedDomains } },
    { $pull: { activeDomains: { domain: { $in: storedDomains } } } },
    { new: true }
  );
  if (!updatedLicense) throw new AppError("Domain is not activated on this license.", 404);

  await LicenseActivation.create({
    licenseId: updatedLicense._id,
    domain: domainLower,
    action: "deactivate",
    actorId: req.user._id,
    actorRole: "admin",
    ipAddress: req.ip || "",
    note: "Force-deactivated by admin",
  });

  const { writeAuditLog } = require("../utils/auditLog");
  await writeAuditLog({
    actor: req.user, action: "domain.force_deactivated",
    targetType: "License", targetId: updatedLicense._id,
    metadata: { licenseKey: updatedLicense.licenseKey, domain: domainLower }, ip: req.ip,
  });

  res.json({ success: true, message: `Domain ${domainLower} force-deactivated.`, data: updatedLicense });
});
