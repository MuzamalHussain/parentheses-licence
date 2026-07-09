const crypto = require("crypto");
const Environments = require("./DeploymentEnvironmentService");
const { writeAuditLog } = require("../../utils/auditLog");

const approvals = new Map();

function requiresApproval(environmentId) {
  return Boolean(Environments.getEnvironment(environmentId)?.requiresApproval);
}

function requestApproval({ deploymentId, environment, version, operator }) {
  const approval = {
    id: `appr_${crypto.randomUUID()}`,
    deploymentId,
    environment,
    version,
    requestedBy: operator?._id || null,
    status: requiresApproval(environment) ? "pending" : "auto_approved",
    requestedAt: new Date().toISOString(),
    decidedAt: requiresApproval(environment) ? null : new Date().toISOString(),
    decidedBy: null,
    reason: "",
  };
  approvals.set(approval.id, approval);
  return approval;
}

async function decide(id, decision, { actor = null, reason = "", ip = "", requestId = "" } = {}) {
  const approval = approvals.get(id);
  if (!approval) return null;
  approval.status = decision === "approve" ? "approved" : "rejected";
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = actor?._id || null;
  approval.reason = reason;
  await writeAuditLog({
    actor,
    action: decision === "approve" ? "deployment.approval_granted" : "deployment.approval_rejected",
    targetType: "DeploymentApproval",
    targetId: id,
    metadata: approval,
    ip,
    requestId,
  });
  return approval;
}

function list(filters = {}) {
  return Array.from(approvals.values()).filter((approval) => {
    if (filters.status && approval.status !== filters.status) return false;
    if (filters.environment && approval.environment !== filters.environment) return false;
    return true;
  });
}

function getByDeployment(deploymentId) {
  return Array.from(approvals.values()).find((approval) => approval.deploymentId === deploymentId) || null;
}

function resetForTests() {
  approvals.clear();
}

module.exports = { decide, getByDeployment, list, requestApproval, requiresApproval, resetForTests };
