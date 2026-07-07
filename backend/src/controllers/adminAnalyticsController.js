const asyncHandler = require("express-async-handler");
const AnalyticsService = require("../services/analytics/AnalyticsService");

exports.getExecutive = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.executive(req.query) });
});

exports.getProducts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.productAnalytics(req.query) });
});

exports.getVersions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.versionAnalytics(req.query) });
});

exports.getCustomers = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.customerAnalytics(req.query) });
});

exports.getLicenses = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.licenseAnalytics(req.query) });
});

exports.getPayments = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.paymentAnalytics(req.query) });
});

exports.getDownloads = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AnalyticsService.downloadAnalytics(req.query) });
});
