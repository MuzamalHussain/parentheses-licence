const asyncHandler = require("express-async-handler");
const Plan = require("../models/Plan");
const Product = require("../models/Product");
const { AppError } = require("../utils/errorHandler");

// GET /api/v1/products/:productId/plans
exports.getPlans = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const filter = { productId: req.params.productId, ...(isAdmin ? {} : { isActive: true }) };
  // Plans-per-product is naturally bounded (a handful per product), but a
  // hard cap is kept as a defense-in-depth measure against unbounded growth.
  const plans = await Plan.find(filter).sort({ priceUSD: 1 }).limit(100);
  res.json({ success: true, data: plans });
});

// GET /api/v1/products/:productId/plans/:id
exports.getPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.params.id, productId: req.params.productId });
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, data: plan });
});

// POST /api/v1/admin/products/:productId/plans
exports.createPlan = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw new AppError("Product not found.", 404);

  const plan = await Plan.create({ ...req.body, productId: req.params.productId });
  res.status(201).json({ success: true, message: "Plan created.", data: plan });
});

// PATCH /api/v1/admin/products/:productId/plans/:id
exports.updatePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, message: "Plan updated.", data: plan });
});

// DELETE /api/v1/admin/products/:productId/plans/:id  (soft delete)
exports.deletePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOneAndUpdate(
    { _id: req.params.id, productId: req.params.productId },
    { isActive: false },
    { new: true }
  );
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, message: "Plan deactivated.", data: plan });
});
