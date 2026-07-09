const asyncHandler = require("express-async-handler");
const AIWorkflowManager = require("../services/aiWorkflow/AIWorkflowManager");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.dashboard({ actor: req.user, organizationId: orgId(req) });
  res.json({ success: true, data });
});

exports.plan = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.plan({ actor: req.user, organizationId: orgId(req) }, context(req));
  res.status(201).json({ success: true, data });
});

exports.approve = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.approve({ actor: req.user, id: req.params.id }, context(req));
  res.json({ success: true, data });
});

exports.reject = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.reject({ actor: req.user, id: req.params.id }, context(req));
  res.json({ success: true, data });
});

exports.execute = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.execute({ actor: req.user, id: req.params.id }, context(req));
  res.status(202).json({ success: true, data });
});

exports.updatePolicy = asyncHandler(async (req, res) => {
  const data = await AIWorkflowManager.updatePolicy({ actor: req.user, input: { ...req.body, organizationId: orgId(req) } }, context(req));
  res.json({ success: true, data });
});
