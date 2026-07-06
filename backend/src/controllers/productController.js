const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const Plan = require("../models/Plan");
const PluginVersion = require("../models/PluginVersion");
const License = require("../models/License");
const Download = require("../models/Download");
const { AppError } = require("../utils/errorHandler");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");
const { PRODUCT_STATUS } = require("../utils/constants");

const PUBLIC_PRODUCT_STATUSES = [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.PUBLISHED];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyAdminProductFilters(req, filter) {
  if (req.query.status) filter.status = req.query.status;
  if (req.query.releaseChannel) filter.defaultReleaseChannel = req.query.releaseChannel;
  if (req.query.published === "true") filter.status = { $in: PUBLIC_PRODUCT_STATUSES };
  if (req.query.archived === "true") filter.status = PRODUCT_STATUS.ARCHIVED;
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search.trim()), "i");
    filter.$or = [
      { name: pattern },
      { slug: pattern },
      { internalProductCode: pattern },
    ];
  }
}

async function attachAdminProductMetadata(products) {
  if (!products.length) return products;
  const productIds = products.map((product) => product._id);
  const [plans, latestVersions, activeLicenseCounts, downloadCounts] = await Promise.all([
    Plan.find({ productId: { $in: productIds } }).sort({ createdAt: 1 }).lean(),
    PluginVersion.aggregate([
      { $match: { productId: { $in: productIds } } },
      { $sort: { releasedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$productId",
          versionNumber: { $first: "$versionNumber" },
          isPublished: { $first: "$isPublished" },
          releasedAt: { $first: "$releasedAt" },
          createdAt: { $first: "$createdAt" },
        },
      },
    ]),
    License.aggregate([
      { $match: { productId: { $in: productIds }, status: "active" } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
    Download.aggregate([
      {
        $lookup: {
          from: "pluginversions",
          localField: "pluginVersionId",
          foreignField: "_id",
          as: "version",
        },
      },
      { $unwind: "$version" },
      { $match: { "version.productId": { $in: productIds } } },
      { $group: { _id: "$version.productId", count: { $sum: 1 } } },
    ]),
  ]);

  const plansByProduct = new Map();
  for (const plan of plans) {
    const key = plan.productId.toString();
    plansByProduct.set(key, [...(plansByProduct.get(key) || []), plan]);
  }
  const versionByProduct = new Map(latestVersions.map((row) => [row._id.toString(), row]));
  const licenseCountByProduct = new Map(activeLicenseCounts.map((row) => [row._id.toString(), row.count]));
  const downloadCountByProduct = new Map(downloadCounts.map((row) => [row._id.toString(), row.count]));

  return products.map((product) => {
    const key = product._id.toString();
    return {
      ...product,
      plans: plansByProduct.get(key) || [],
      latestVersion: versionByProduct.get(key) || null,
      activeLicenseCount: licenseCountByProduct.get(key) || 0,
      downloadCount: downloadCountByProduct.get(key) || 0,
    };
  });
}

function handleDuplicateProduct(error) {
  if (error?.code !== 11000) throw error;
  const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "product field";
  throw new AppError(`${field} must be unique.`, 409);
}

// GET /api/v1/products
exports.getProducts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const filter = isAdmin ? {} : { status: { $in: PUBLIC_PRODUCT_STATUSES } };
  if (isAdmin) applyAdminProductFilters(req, filter);

  const [rawProducts, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  const products = isAdmin ? await attachAdminProductMetadata(rawProducts) : rawProducts;

  res.json({
    success: true,
    data: products,
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/products/:id
exports.getProduct = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "admin";
  const product = await Product.findById(req.params.id).lean();

  if (!product) throw new AppError("Product not found.", 404);
  if (!isAdmin && !PUBLIC_PRODUCT_STATUSES.includes(product.status)) throw new AppError("Product not found.", 404);

  const plans = await Plan.find({ productId: product._id, ...(isAdmin ? {} : { isActive: true }) }).lean();
  res.json({ success: true, data: { ...product, plans } });
});

// POST /api/v1/admin/products
exports.createProduct = asyncHandler(async (req, res) => {
  try {
    const product = await Product.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, message: "Product created.", data: product });
  } catch (error) {
    handleDuplicateProduct(error);
  }
});

// PATCH /api/v1/admin/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) throw new AppError("Product not found.", 404);
    res.json({ success: true, message: "Product updated.", data: product });
  } catch (error) {
    handleDuplicateProduct(error);
  }
});

// DELETE /api/v1/admin/products/:id
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { status: PRODUCT_STATUS.ARCHIVED },
    { new: true }
  );
  if (!product) throw new AppError("Product not found.", 404);
  res.json({ success: true, message: "Product archived (soft delete).", data: product });
});
