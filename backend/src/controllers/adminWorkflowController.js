const asyncHandler = require("express-async-handler");
const WorkflowJob = require("../models/WorkflowJob");
const WorkflowEngine = require("../services/workflows/WorkflowEngine");

exports.getOverview = asyncHandler(async (req, res) => {
  const stats = await WorkflowEngine.stats();
  res.json({
    success: true,
    data: {
      stats,
      workflows: WorkflowEngine.registry.list(),
      recurring: WorkflowEngine.scheduler.listRecurring(),
    },
  });
});

exports.listJobs = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.eventName) filter.eventName = req.query.eventName;
  if (req.query.workflowName) filter.workflowName = req.query.workflowName;

  const [items, total] = await Promise.all([
    WorkflowJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkflowJob.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, total, page, limit } });
});

exports.retryJob = asyncHandler(async (req, res) => {
  const result = await WorkflowEngine.retryJob(req.params.id, req.user);
  if (!result) return res.status(404).json({ success: false, message: "Workflow job not found." });
  res.json({ success: true, data: result });
});

exports.cancelJob = asyncHandler(async (req, res) => {
  const job = await WorkflowEngine.cancelJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, message: "Workflow job not found or cannot be cancelled." });
  res.json({ success: true, data: job });
});

exports.dispatchEvent = asyncHandler(async (req, res) => {
  const result = await WorkflowEngine.dispatch(req.body.eventName, req.body.payload || {}, {
    metadata: req.body.metadata || {},
    idempotencyKey: req.body.idempotencyKey,
    actor: req.user,
    requestId: req.id,
    ip: req.ip,
  });
  res.status(202).json({ success: true, data: result });
});
