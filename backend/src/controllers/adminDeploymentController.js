const asyncHandler = require("express-async-handler");
const Deployment = require("../services/deployment/DeploymentManager");
const Approvals = require("../services/deployment/DeploymentApprovalService");
const Environments = require("../services/deployment/DeploymentEnvironmentService");
const Rollback = require("../services/deployment/RollbackService");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Deployment.dashboard(), requestId: req.id });
});

exports.start = asyncHandler(async (req, res) => {
  const data = await Deployment.startDeployment({
    version: req.body?.version,
    previousVersion: req.body?.previousVersion || "",
    environment: req.body?.environment || "development",
    operator: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(201).json({ success: true, data, requestId: req.id });
});

exports.promote = asyncHandler(async (req, res) => {
  const data = await Deployment.promote({
    from: req.body?.from || "development",
    to: req.body?.to || "staging",
    version: req.body?.version,
    operator: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data, requestId: req.id });
});

exports.approve = asyncHandler(async (req, res) => {
  const approval = await Approvals.decide(req.params.id, req.body?.decision || "approve", {
    actor: req.user,
    reason: req.body?.reason || "",
    ip: req.ip,
    requestId: req.id,
  });
  let deployment = null;
  if (approval?.status === "approved") {
    deployment = await Deployment.completeDeployment(approval.deploymentId, { actor: req.user, ip: req.ip, requestId: req.id });
  }
  res.json({ success: Boolean(approval), data: { approval, deployment }, requestId: req.id });
});

exports.health = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Deployment.verifyHealth(req.query.environment || "local"), requestId: req.id });
});

exports.updateEnvironment = asyncHandler(async (req, res) => {
  const data = Environments.updateEnvironment(req.params.id, req.body || {});
  res.json({ success: Boolean(data), data, requestId: req.id });
});

exports.rollbackValidate = asyncHandler(async (req, res) => {
  const data = Rollback.validate({
    deploymentId: req.body?.deploymentId,
    targetVersion: req.body?.targetVersion || "",
    rollbackType: req.body?.rollbackType || "application",
  });
  res.json({ success: data.valid, data, requestId: req.id });
});
