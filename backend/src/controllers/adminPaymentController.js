const asyncHandler = require("express-async-handler");
const Payment = require("../models/Payment");
const WebhookEvent = require("../models/WebhookEvent");
const { getPagination, paginationMeta } = require("../utils/pagination");

exports.getPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.gateway) filter.gateway = req.query.gateway;
  if (req.query.status) filter.status = req.query.status;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("orderId", "orderNumber status paymentStatus currency amount grandTotal userId")
      .lean(),
    Payment.countDocuments(filter),
  ]);

  res.json({ success: true, data: payments, pagination: paginationMeta({ page, limit, total }) });
});

exports.getWebhookLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.gateway) filter.gateway = req.query.gateway;
  if (req.query.status) filter.status = req.query.status;

  const [events, total] = await Promise.all([
    WebhookEvent.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-payload")
      .lean(),
    WebhookEvent.countDocuments(filter),
  ]);

  res.json({ success: true, data: events, pagination: paginationMeta({ page, limit, total }) });
});

exports.retryWebhook = asyncHandler(async (req, res) => {
  const event = await WebhookEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ success: false, message: "Webhook event not found." });
  if (event.status !== "failed") return res.status(400).json({ success: false, message: "Only failed webhooks can be marked for retry." });

  event.status = "processing";
  event.processed = false;
  event.processingError = "";
  event.processedAt = null;
  await event.save();

  res.json({ success: true, message: "Webhook marked for provider retry.", data: event });
});
