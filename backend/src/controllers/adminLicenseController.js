const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const Plan = require("../models/Plan");
const User = require("../models/User");
const Product = require("../models/Product");
const { generateUniqueLicenseKey } = require("../utils/licenseKey");
const { writeAuditLog } = require("../utils/auditLog");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { getCached } = require("../utils/ttlCache");
const performanceConfig = require("../config/performance");

// ─── Helper: populate license with product/plan/user ────────────────────────
const populateLicense = (query) =>
  query
    .populate("userId",    "name email companyName")
    .populate("productId", "name slug")
    .populate("planId",    "name allowedSites priceUSD priceLocal renewalType durationDays");

// ─── GET /api/v1/admin/licenses ─────────────────────────────────────────────
exports.getLicenses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.status)    filter.status    = req.query.status;
  if (req.query.productId) filter.productId = req.query.productId;
  if (req.query.userId)    filter.userId    = req.query.userId;

  // Search by license key (partial, case-insensitive)
  if (req.query.search) {
    filter.licenseKey = { $regex: req.query.search.replace(/-/g, ""), $options: "i" };
  }

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

// ─── GET /api/v1/admin/licenses/:id ─────────────────────────────────────────
exports.getLicense = asyncHandler(async (req, res) => {
  const license = await populateLicense(License.findById(req.params.id));
  if (!license) throw new AppError("License not found.", 404);
  res.json({ success: true, data: license });
});

// ─── POST /api/v1/admin/licenses ────────────────────────────────────────────
exports.createLicense = asyncHandler(async (req, res) => {
  const { userId, productId, planId, expiresAt, allowedSitesOverride, notes } = req.body;

  // Validate user
  const user = await User.findById(userId);
  if (!user) throw new AppError("Customer not found.", 404);

  // Validate product + plan
  const plan = await Plan.findOne({ _id: planId, productId, isActive: true });
  if (!plan) throw new AppError("Plan not found or does not belong to this product.", 404);

  const product = await Product.findById(productId);
  if (!product) throw new AppError("Product not found.", 404);

  // allowedSites: use plan default unless admin explicitly overrides
  const allowedSites = allowedSitesOverride !== undefined ? allowedSitesOverride : plan.allowedSites;

  // expiresAt: use body value, or derive from plan durationDays if not provided
  let computedExpiry = expiresAt || null;
  if (!computedExpiry && plan.durationDays && plan.renewalType === "recurring") {
    computedExpiry = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
  }

  let license;
  let licenseKey;
  for (let attempt = 0; attempt < 3; attempt++) {
    licenseKey = await generateUniqueLicenseKey(License);
    try {
      license = await License.create({
        licenseKey,
        userId,
        productId,
        planId,
        allowedSites,
        expiresAt: computedExpiry,
        notes: notes || "",
      });
      break;
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err;
    }
  }

  await writeAuditLog({
    actor: req.user,
    action: "license.created",
    targetType: "License",
    targetId: license._id,
    metadata: { licenseKey, userId, productId, planId, allowedSites },
    ip: req.ip,
  });

  const populated = await populateLicense(License.findById(license._id));
  res.status(201).json({ success: true, message: "License created.", data: populated });
});

// ─── PATCH /api/v1/admin/licenses/:id ───────────────────────────────────────
exports.updateLicense = asyncHandler(async (req, res) => {
  const allowed = ["expiresAt", "allowedSites", "notes"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const license = await License.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!license) throw new AppError("License not found.", 404);

  await writeAuditLog({
    actor: req.user, action: "license.updated",
    targetType: "License", targetId: license._id,
    metadata: updates, ip: req.ip,
  });

  res.json({ success: true, message: "License updated.", data: license });
});

// ─── POST /api/v1/admin/licenses/:id/suspend ────────────────────────────────
exports.suspendLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  if (license.status === "revoked") throw new AppError("Cannot suspend a revoked license.", 400);
  if (license.status === "suspended") throw new AppError("License is already suspended.", 400);

  license.status      = "suspended";
  license.suspendedAt = new Date();
  license.suspendedBy = req.user._id;
  await license.save();

  await writeAuditLog({
    actor: req.user, action: "license.suspended",
    targetType: "License", targetId: license._id,
    metadata: { licenseKey: license.licenseKey, reason: req.body.reason || "" }, ip: req.ip,
  });

  res.json({ success: true, message: "License suspended.", data: license });
});

// ─── POST /api/v1/admin/licenses/:id/reinstate ──────────────────────────────
exports.reinstateLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  if (license.status === "revoked") throw new AppError("Cannot reinstate a revoked license.", 400);
  if (license.status === "active")  throw new AppError("License is already active.", 400);

  license.status      = "active";
  license.suspendedAt = null;
  license.suspendedBy = null;
  await license.save();

  await writeAuditLog({
    actor: req.user, action: "license.reinstated",
    targetType: "License", targetId: license._id,
    metadata: { licenseKey: license.licenseKey }, ip: req.ip,
  });

  res.json({ success: true, message: "License reinstated.", data: license });
});

// ─── POST /api/v1/admin/licenses/:id/revoke ─────────────────────────────────
exports.revokeLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  if (license.status === "revoked") throw new AppError("License is already revoked.", 400);

  license.status    = "revoked";
  license.revokedAt = new Date();
  license.revokedBy = req.user._id;
  await license.save();

  await writeAuditLog({
    actor: req.user, action: "license.revoked",
    targetType: "License", targetId: license._id,
    metadata: { licenseKey: license.licenseKey, reason: req.body.reason || "" }, ip: req.ip,
  });

  res.json({ success: true, message: "License revoked.", data: license });
});

// ─── POST /api/v1/admin/licenses/:id/reset-activations ──────────────────────
exports.resetActivations = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);

  const previousDomains = [...license.activeDomains];
  license.activeDomains = [];
  await license.save();

  await writeAuditLog({
    actor: req.user, action: "license.activations_reset",
    targetType: "License", targetId: license._id,
    metadata: { licenseKey: license.licenseKey, clearedDomains: previousDomains.map((d) => d.domain) },
    ip: req.ip,
  });

  res.json({ success: true, message: `Activations reset. ${previousDomains.length} domain(s) cleared.`, data: license });
});

// ─── GET /api/v1/admin/licenses/stats ───────────────────────────────────────
exports.getLicenseStats = asyncHandler(async (req, res) => {
  const data = await getCached("admin:licenses:stats:v1", performanceConfig.cache.statsTtlMs, async () => {
    const [statusCounts, recentLicenses] = await Promise.all([
      License.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      License.find().sort({ createdAt: -1 }).limit(5)
        .select("licenseKey status userId productId createdAt expiresAt")
        .populate("userId", "name email")
        .populate("productId", "name")
        .lean(),
    ]);

    const stats = { active: 0, suspended: 0, revoked: 0, expired: 0, total: 0 };
    statusCounts.forEach(({ _id, count }) => {
      if (_id in stats) stats[_id] = count;
      stats.total += count;
    });
    return { stats, recentLicenses };
  });

  res.json({ success: true, data });
});
