const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");

const populateLicense = (query) =>
  query
    .populate("productId", "name slug")
    .populate("planId",    "name allowedSites priceUSD priceLocal renewalType durationDays");

// GET /api/v1/licenses  — customer's own licenses
exports.getMyLicenses = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50,  parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [licenses, total] = await Promise.all([
    populateLicense(License.find(filter)).sort({ createdAt: -1 }).skip(skip).limit(limit),
    License.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: licenses,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
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
  const license = await License.findOne({ _id: req.params.id, userId: req.user._id });
  if (!license) throw new AppError("License not found.", 404);

  const history = await LicenseActivation.find({ licenseId: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50);

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

  res.json({ success: true, message: "Domain deactivated. Slot is now free.", data: updatedLicense });
});

// GET /api/v1/licenses/summary — stats for customer dashboard cards
exports.getMySummary = asyncHandler(async (req, res) => {
  const [licenses] = await Promise.all([
    License.find({ userId: req.user._id }),
  ]);

  const summary = {
    totalLicenses:   licenses.length,
    activeLicenses:  licenses.filter((l) => l.status === "active").length,
    activeDomains:   licenses.reduce((sum, l) => sum + l.activeDomains.length, 0),
    expiringInDays30: licenses.filter((l) => {
      if (!l.expiresAt || l.status !== "active") return false;
      const diff = (new Date(l.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 30;
    }).length,
  };

  res.json({ success: true, data: summary });
});
