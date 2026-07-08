const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const PluginVersion = require("../models/PluginVersion");
const License = require("../models/License");
const Order = require("../models/Order");
const Download = require("../models/Download");
const User = require("../models/User");
const LicenseActivation = require("../models/LicenseActivation");
const AnalyticsService = require("../services/analytics/AnalyticsService");
const OpenApiService = require("../services/publicApi/OpenApiService");
const { PRODUCT_STATUS } = require("../utils/constants");
const { getPagination, paginationMeta } = require("../utils/pagination");

const PUBLIC_PRODUCT_STATUSES = [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.PUBLISHED];

function send(res, data, pagination = null) {
  res.json({ success: true, data, ...(pagination ? { pagination } : {}) });
}

async function listWithPagination(req, model, filter, projection = "") {
  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const [items, total] = await Promise.all([
    model.find(filter).select(projection).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return { items, pagination: paginationMeta({ page, limit, total }) };
}

exports.getOpenApi = asyncHandler(async (req, res) => {
  send(res, OpenApiService.getOpenApiMetadata());
});

exports.listProducts = asyncHandler(async (req, res) => {
  const result = await listWithPagination(req, Product, { status: { $in: PUBLIC_PRODUCT_STATUSES } }, "-createdBy");
  send(res, result.items, result.pagination);
});

exports.listVersions = asyncHandler(async (req, res) => {
  const result = await listWithPagination(req, PluginVersion, {
    productId: req.params.id,
    status: { $in: ["published"] },
  });
  send(res, result.items, result.pagination);
});

exports.listLicenses = asyncHandler(async (req, res) => {
  const filter = req.apiKey?.scopes?.includes("admin") ? {} : { userId: req.apiKey.ownerId };
  const result = await listWithPagination(req, License, filter, "-metadata");
  send(res, result.items, result.pagination);
});

exports.listOrders = asyncHandler(async (req, res) => {
  const filter = req.apiKey?.scopes?.includes("admin") ? {} : { userId: req.apiKey.ownerId };
  const result = await listWithPagination(req, Order, filter, "-rawWebhookPayload");
  send(res, result.items, result.pagination);
});

exports.listDownloads = asyncHandler(async (req, res) => {
  const filter = req.apiKey?.scopes?.includes("admin") ? {} : { userId: req.apiKey.ownerId };
  const result = await listWithPagination(req, Download, filter, "-tokenHash");
  send(res, result.items, result.pagination);
});

exports.listCustomers = asyncHandler(async (req, res) => {
  const result = await listWithPagination(req, User, { role: "customer" }, "name email companyName isActive createdAt");
  send(res, result.items, result.pagination);
});

exports.listActivations = asyncHandler(async (req, res) => {
  const result = await listWithPagination(req, LicenseActivation, {}, "");
  send(res, result.items, result.pagination);
});

exports.analyticsSummary = asyncHandler(async (req, res) => {
  const data = await AnalyticsService.executive({ period: req.query.period || "30d" });
  send(res, data);
});
