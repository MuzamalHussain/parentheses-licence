const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const Plan = require("../models/Plan");
const { AppError } = require("../utils/errorHandler");

// GET /api/v1/products  (public — active only for customers, all for admin)
exports.getProducts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const filter = isAdmin ? {} : { status: "active" };
  if (req.query.status && isAdmin) filter.status = req.query.status;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /api/v1/products/:id  (public for active, admin sees all)
exports.getProduct = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const product = await Product.findById(req.params.id);

  if (!product) throw new AppError("Product not found.", 404);
  if (!isAdmin && product.status !== "active") throw new AppError("Product not found.", 404);

  // Attach plans
  const plans = await Plan.find({ productId: product._id, ...(isAdmin ? {} : { isActive: true }) });
  res.json({ success: true, data: { ...product.toObject(), plans } });
});

// POST /api/v1/admin/products  (admin only)
exports.createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, message: "Product created.", data: product });
});

// PATCH /api/v1/admin/products/:id  (admin only)
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError("Product not found.", 404);
  res.json({ success: true, message: "Product updated.", data: product });
});

// DELETE /api/v1/admin/products/:id  (admin only — soft delete via archive)
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { status: "archived" },
    { new: true }
  );
  if (!product) throw new AppError("Product not found.", 404);
  res.json({ success: true, message: "Product archived (soft delete).", data: product });
});
