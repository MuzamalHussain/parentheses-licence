const asyncHandler = require("express-async-handler");
const WebhookManager = require("../services/webhooks/WebhookManager");

exports.getOverview = asyncHandler(async (req, res) => {
  const [endpoints, deliveries, stats] = await Promise.all([
    WebhookManager.listEndpoints(),
    WebhookManager.listDeliveries(req.query),
    WebhookManager.stats(),
  ]);
  res.json({
    success: true,
    data: {
      endpoints,
      deliveries,
      stats,
      events: WebhookManager.registry.list(),
    },
    requestId: req.id,
  });
});

exports.createWebhook = asyncHandler(async (req, res) => {
  const result = await WebhookManager.createEndpoint({
    ...req.body,
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(201).json({ success: true, data: result, requestId: req.id });
});

exports.updateWebhook = asyncHandler(async (req, res) => {
  const endpoint = await WebhookManager.updateEndpoint(req.params.id, req.body, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  if (!endpoint) return res.status(404).json({ success: false, message: "Webhook endpoint not found.", requestId: req.id });
  res.json({ success: true, data: endpoint, requestId: req.id });
});

exports.deleteWebhook = asyncHandler(async (req, res) => {
  const endpoint = await WebhookManager.deleteEndpoint(req.params.id, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  if (!endpoint) return res.status(404).json({ success: false, message: "Webhook endpoint not found.", requestId: req.id });
  res.json({ success: true, data: endpoint, requestId: req.id });
});

exports.retryDelivery = asyncHandler(async (req, res) => {
  const result = await WebhookManager.retry.retryDelivery(req.params.id, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  if (!result) return res.status(404).json({ success: false, message: "Webhook delivery not found.", requestId: req.id });
  res.json({ success: true, data: result, requestId: req.id });
});

exports.processRetryQueue = asyncHandler(async (req, res) => {
  const result = await WebhookManager.retry.processRetryQueue({
    limit: Number(req.body.limit || 25),
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data: result, requestId: req.id });
});
