const asyncHandler = require("express-async-handler");
const Infrastructure = require("../services/infrastructure/InfrastructureService");
const HealthRegistry = require("../services/infrastructure/HealthRegistry");
const QueueArchitecture = require("../services/infrastructure/QueueArchitectureService");
const Capacity = require("../services/infrastructure/CapacityMetricsService");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Infrastructure.dashboard(), requestId: req.id });
});

exports.health = asyncHandler(async (req, res) => {
  const data = await HealthRegistry.snapshot();
  res.status(data.status === "down" ? 503 : 200).json({ success: data.status !== "down", data, requestId: req.id });
});

exports.queue = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await QueueArchitecture.status(), requestId: req.id });
});

exports.capacity = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Capacity.snapshot(), requestId: req.id });
});
