const asyncHandler = require("express-async-handler");
const Governance = require("../services/aiGovernance/AIGovernanceService");
const Approvals = require("../services/aiGovernance/AIApprovalService");
const ModelLifecycle = require("../services/aiGovernance/AIModelLifecycleManager");
const ModelVersions = require("../services/aiGovernance/AIModelVersionManager");
const Routing = require("../services/aiGovernance/AIProviderRoutingService");
const ModelHealth = require("../services/aiGovernance/AIModelHealthService");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await Governance.dashboard({ actor: req.user, organizationId: orgId(req) }, context(req));
  res.json({ success: true, data });
});

exports.savePolicy = asyncHandler(async (req, res) => {
  const data = await Governance.savePolicy({ actor: req.user, organizationId: orgId(req), input: req.body }, context(req));
  res.json({ success: true, data });
});

exports.enforcePolicy = asyncHandler(async (req, res) => {
  const data = await Governance.enforce({ actor: req.user, organizationId: orgId(req), estimatedCost: req.body.estimatedCost }, context(req));
  res.json({ success: true, data });
});

exports.submitPrompt = asyncHandler(async (req, res) => {
  const data = await Approvals.submitPrompt({ actor: req.user, organizationId: orgId(req), input: req.body }, context(req));
  res.status(201).json({ success: true, data });
});

exports.transitionPrompt = asyncHandler(async (req, res) => {
  const data = await Approvals.transitionPrompt({ actor: req.user, organizationId: orgId(req), key: req.body.key, version: req.body.version, status: req.body.status, notes: req.body.notes }, context(req));
  res.json({ success: true, data });
});

exports.rollbackPrompt = asyncHandler(async (req, res) => {
  const data = await Approvals.rollbackPrompt({ actor: req.user, organizationId: orgId(req), key: req.body.key, fromVersion: req.body.fromVersion, toVersion: req.body.toVersion }, context(req));
  res.json({ success: true, data });
});

exports.modelTransition = asyncHandler(async (req, res) => {
  const data = await ModelLifecycle.transition({ actor: req.user, organizationId: orgId(req), providerId: req.body.providerId, modelId: req.body.modelId, status: req.body.status, isDefault: req.body.isDefault, priority: req.body.priority, capabilities: req.body.capabilities }, context(req));
  res.json({ success: true, data });
});

exports.modelVersion = asyncHandler(async (req, res) => {
  const data = await ModelVersions.createVersion({ actor: req.user, organizationId: orgId(req), providerId: req.body.providerId, baseModelId: req.body.baseModelId, newModelId: req.body.newModelId, version: req.body.version, metadata: req.body.metadata || {} }, context(req));
  res.status(201).json({ success: true, data });
});

exports.routeProvider = asyncHandler(async (req, res) => {
  const data = await Routing.route({ organizationId: orgId(req), capability: req.query.capability || req.body.capability, strategy: req.query.strategy || req.body.strategy });
  res.json({ success: true, data });
});

exports.modelHealth = asyncHandler(async (req, res) => {
  const data = await ModelHealth.health({ organizationId: orgId(req), providerId: req.query.providerId, modelId: req.query.modelId });
  res.json({ success: true, data });
});
