const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const Plan = require("../models/Plan");
const User = require("../models/User");
const Product = require("../models/Product");
const LicenseSite = require("../models/LicenseSite");
const { generateUniqueLicenseKey } = require("../utils/licenseKey");
const { writeAuditLog } = require("../utils/auditLog");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { getCached } = require("../utils/ttlCache");
const performanceConfig = require("../config/performance");
const lifecycle = require("../services/licenseLifecycleService");
const siteActivation = require("../services/siteActivationService");

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
      data: licenses.map(lifecycle.attachLifecycleSummary),
    pagination: paginationMeta({ page, limit, total }),
  });
});

// ─── GET /api/v1/admin/licenses/:id ─────────────────────────────────────────
exports.getLicense = asyncHandler(async (req, res) => {
  const license = await populateLicense(License.findById(req.params.id));
  if (!license) throw new AppError("License not found.", 404);
  res.json({ success: true, data: lifecycle.attachLifecycleSummary(license) });
});

exports.getLicenseSites = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id).select("_id");
  if (!license) throw new AppError("License not found.", 404);
  const { page, limit, skip } = getPagination(req.query);
  const [sites, total] = await Promise.all([
    LicenseSite.find({ licenseId: req.params.id })
      .sort({ lastContactAt: -1, activatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LicenseSite.countDocuments({ licenseId: req.params.id }),
  ]);
  res.json({ success: true, data: sites, pagination: paginationMeta({ page, limit, total }) });
});

// ─── POST /api/v1/admin/licenses ────────────────────────────────────────────
exports.createLicense = asyncHandler(async (req, res) => {
  const { userId, productId, planId, expiresAt, allowedSitesOverride, notes, status, licenseType, entitlements } = req.body;

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
        status: status || "active",
        licenseType: licenseType || (allowedSites === 0 ? "unlimited" : "single_site"),
        entitlements: entitlements || undefined,
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
  res.status(201).json({ success: true, message: "License created.", data: lifecycle.attachLifecycleSummary(populated) });
});

// ─── PATCH /api/v1/admin/licenses/:id ───────────────────────────────────────
exports.updateLicense = asyncHandler(async (req, res) => {
  const allowed = ["expiresAt", "allowedSites", "notes", "status", "licenseType", "entitlements", "allowedReleaseChannels", "downloadLimits", "renewal", "subscription"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const license = await License.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!license) throw new AppError("License not found.", 404);

  await writeAuditLog({
    actor: req.user, action: "license.updated",
    targetType: "License", targetId: license._id,
    metadata: updates, ip: req.ip,
  });

  res.json({ success: true, message: "License updated.", data: lifecycle.attachLifecycleSummary(license) });
});

// ─── POST /api/v1/admin/licenses/:id/suspend ────────────────────────────────
exports.suspendLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  const updated = await lifecycle.transitionLicense({ license, action: "suspend", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License suspended.", data: lifecycle.attachLifecycleSummary(updated) });
});

// ─── POST /api/v1/admin/licenses/:id/reinstate ──────────────────────────────
exports.reinstateLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  const updated = await lifecycle.transitionLicense({ license, action: "reinstate", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License reinstated.", data: lifecycle.attachLifecycleSummary(updated) });
});

// ─── POST /api/v1/admin/licenses/:id/revoke ─────────────────────────────────
exports.revokeLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  const updated = await lifecycle.transitionLicense({ license, action: "revoke", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License revoked.", data: lifecycle.attachLifecycleSummary(updated) });
});

// ─── POST /api/v1/admin/licenses/:id/reset-activations ──────────────────────
exports.resetActivations = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  const count = license.activeDomains.length;
  const updated = await lifecycle.resetActivations({ license, actor: req.user, req });
  res.json({ success: true, message: `Activations reset. ${count} domain(s) cleared.`, data: lifecycle.attachLifecycleSummary(updated) });
});

exports.activateLicense = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionLicense({ license: await License.findById(req.params.id), action: "activate", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License activated.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.expireLicense = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionLicense({ license: await License.findById(req.params.id), action: "expire", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License expired.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.cancelLicense = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionLicense({ license: await License.findById(req.params.id), action: "cancel", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License cancelled.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.convertTrial = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionLicense({ license: await License.findById(req.params.id), action: "convert_trial", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "Trial converted.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.convertLifetime = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionLicense({ license: await License.findById(req.params.id), action: "convert_lifetime", actor: req.user, req, payload: req.body });
  res.json({ success: true, message: "License converted to lifetime.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.renewLicense = asyncHandler(async (req, res) => {
  const updated = await lifecycle.renewLicense({ license: await License.findById(req.params.id), actor: req.user, req, ...req.body });
  res.json({ success: true, message: "License renewed.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.transferLicense = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transferLicense({ license: await License.findById(req.params.id), toUserId: req.body.toUserId, actor: req.user, req, note: req.body.note || "" });
  res.json({ success: true, message: "License transferred.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.changePlan = asyncHandler(async (req, res) => {
  const updated = await lifecycle.changePlan({ license: await License.findById(req.params.id), toPlanId: req.body.toPlanId, actor: req.user, req, changeType: req.body.changeType || "upgrade", note: req.body.note || "", reason: req.body.reason || "" });
  res.json({ success: true, message: "License plan changed.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.subscriptionAction = asyncHandler(async (req, res) => {
  const updated = await lifecycle.transitionSubscription({
    license: await License.findById(req.params.id),
    action: req.body.action,
    actor: req.user,
    req,
    reason: req.body.reason || "",
  });
  res.json({ success: true, message: "Subscription updated.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.extendExpiration = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  license.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : new Date(Date.now() + Number(req.body.days || 365) * 24 * 60 * 60 * 1000);
  if (license.status === "expired") license.status = "active";
  license.renewal = { ...(license.renewal || {}), nextRenewalAt: license.expiresAt };
  license.subscription = { ...(license.subscription || {}), renewalDate: license.expiresAt };
  await license.save();
  await writeAuditLog({ actor: req.user, action: "license.expiration_extended", targetType: "License", targetId: license._id, metadata: { expiresAt: license.expiresAt }, ip: req.ip });
  res.json({ success: true, message: "Expiration extended.", data: lifecycle.attachLifecycleSummary(license) });
});

exports.manualActivate = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  await siteActivation.upsertSiteActivation({ license, input: req.body, actor: req.user, actorRole: "admin", req });
  const updated = await License.findById(req.params.id);
  res.json({ success: true, message: "Domain manually activated.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.forceDeactivate = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  await siteActivation.deactivateSite({ license, domain: req.body.domain, actor: req.user, actorRole: "admin", req, force: true });
  const updated = await License.findById(req.params.id);
  res.json({ success: true, message: "Domain force deactivated.", data: lifecycle.attachLifecycleSummary(updated) });
});

exports.siteAction = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) throw new AppError("License not found.", 404);
  const site = await siteActivation.adminSiteAction({
    license,
    domain: req.body.domain,
    action: req.body.action,
    actor: req.user,
    req,
    siteName: req.body.siteName,
  });
  res.json({ success: true, message: "Site action completed.", data: site });
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

    const stats = { draft: 0, pending: 0, active: 0, suspended: 0, revoked: 0, expired: 0, cancelled: 0, trial: 0, lifetime: 0, total: 0 };
    statusCounts.forEach(({ _id, count }) => {
      if (_id in stats) stats[_id] = count;
      stats.total += count;
    });
    return { stats, recentLicenses };
  });

  res.json({ success: true, data });
});
