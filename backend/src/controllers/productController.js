const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const Plan = require("../models/Plan");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");

// GET /api/v1/products  (public — active only for customers, all for admin)
exports.getProducts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const filter = isAdmin ? {} : { status: "active" };
  if (req.query.status && isAdmin) filter.status = req.query.status;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/products/:id  (public for active, admin sees all)
exports.getProduct = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const product = await Product.findById(req.params.id).lean();

  if (!product) throw new AppError("Product not found.", 404);
  if (!isAdmin && product.status !== "active") throw new AppError("Product not found.", 404);

  // Attach plans
  const plans = await Plan.find({ productId: product._id, ...(isAdmin ? {} : { isActive: true }) }).lean();
  res.json({ success: true, data: { ...product, plans } });
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
