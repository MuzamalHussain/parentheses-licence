const asyncHandler = require("express-async-handler");
const Coupon = require("../models/Coupon");
const { writeAuditLog } = require("../utils/auditLog");
const { AppError } = require("../utils/errorHandler");

// GET /api/v1/admin/coupons
exports.getCoupons = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.query.search) filter.code = { $regex: req.query.search, $options: "i" };
  if (req.query.active === "true")  filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Coupon.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: coupons,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /api/v1/admin/coupons/:id
exports.getCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw new AppError("Coupon not found.", 404);
  res.json({ success: true, data: coupon });
});

// POST /api/v1/admin/coupons
exports.createCoupon = asyncHandler(async (req, res) => {
  const { code, type, value, maxUses, expiresAt } = req.body;

  if (type === "percentage" && value > 100) {
    throw new AppError("Percentage discount cannot exceed 100.", 422);
  }

  const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (existing) throw new AppError("A coupon with this code already exists.", 409);

  const coupon = await Coupon.create({
    code: code.toUpperCase().trim(),
    type,
    value,
    maxUses: maxUses ?? null,
    expiresAt: expiresAt || null,
  });

  await writeAuditLog({
    actor: req.user, action: "coupon.created",
    targetType: "Coupon", targetId: coupon._id,
    metadata: { code: coupon.code, type, value }, ip: req.ip,
  });

  res.status(201).json({ success: true, message: "Coupon created.", data: coupon });
});

// PATCH /api/v1/admin/coupons/:id
exports.updateCoupon = asyncHandler(async (req, res) => {
  const allowed = ["value", "maxUses", "expiresAt", "isActive"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (updates.value !== undefined) {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new AppError("Coupon not found.", 404);
    if (coupon.type === "percentage" && updates.value > 100) {
      throw new AppError("Percentage discount cannot exceed 100.", 422);
    }
  }

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!coupon) throw new AppError("Coupon not found.", 404);

  await writeAuditLog({
    actor: req.user, action: "coupon.updated",
    targetType: "Coupon", targetId: coupon._id,
    metadata: updates, ip: req.ip,
  });

  res.json({ success: true, message: "Coupon updated.", data: coupon });
});

// DELETE /api/v1/admin/coupons/:id  (soft delete — deactivate)
exports.deactivateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!coupon) throw new AppError("Coupon not found.", 404);

  await writeAuditLog({
    actor: req.user, action: "coupon.deactivated",
    targetType: "Coupon", targetId: coupon._id,
    metadata: { code: coupon.code }, ip: req.ip,
  });

  res.json({ success: true, message: "Coupon deactivated.", data: coupon });
});

// POST /api/v1/admin/coupons/validate  — used by checkout preview (optional helper)
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const coupon = await Coupon.findOne({ code: code?.toUpperCase().trim() });
  if (!coupon || !coupon.isValid()) {
    throw new AppError("Coupon is invalid, expired, or has reached its usage limit.", 400);
  }
  res.json({ success: true, data: { code: coupon.code, type: coupon.type, value: coupon.value } });
});
