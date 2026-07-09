const AIWorkflowPolicy = require("../../models/AIWorkflowPolicy");
const Audit = require("../ai/AIAuditService");

const restrictedEvents = new Set(["LicenseSuspended", "LicenseRevoked", "UserDeleted", "ApiKeyRevoked"]);
const riskOrder = { low: 1, medium: 2, high: 3, critical: 4 };

function defaults(category, organizationId = null) {
  return {
    organizationId,
    scope: organizationId ? "organization" : "global",
    category,
    mode: category === "security" || category === "payments" ? "approval_required" : "recommendation_only",
    enabled: true,
    restrictedActions: ["suspend_license", "revoke_license", "delete_user", "revoke_api_key"],
    maxAutomaticRiskLevel: "low",
  };
}

async function resolve({ organizationId, category, riskLevel = "low", role = "" } = {}) {
  const policy = await AIWorkflowPolicy.findOne({ organizationId, category, enabled: true }).lean()
    || await AIWorkflowPolicy.findOne({ organizationId: null, category, enabled: true }).lean()
    || defaults(category, organizationId);
  const mode = policy.mode === "automatic_execution" && riskOrder[riskLevel] > riskOrder[policy.maxAutomaticRiskLevel]
    ? "approval_required"
    : policy.mode;
  return { ...policy, mode, role };
}

function requiresApproval(policy, plan = []) {
  if (!policy?.enabled) return true;
  if (policy.mode === "recommendation_only") return true;
  if (policy.mode === "approval_required") return true;
  return plan.some((step) => step.restricted || restrictedEvents.has(step.eventName));
}

async function upsert(input = {}, context = {}) {
  const payload = { enabled: true, ...input };
  const doc = await AIWorkflowPolicy.findOneAndUpdate(
    { organizationId: payload.organizationId || null, category: payload.category, scope: payload.scope || (payload.organizationId ? "organization" : "global") },
    { $set: { ...payload, updatedBy: context.actor?._id || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Audit.record("ai.workflow_policy_changed", { actor: context.actor, organizationId: doc.organizationId, targetId: doc._id, ip: context.ip, requestId: context.requestId, metadata: { category: doc.category, mode: doc.mode } });
  return doc;
}

async function list(organizationId) {
  return AIWorkflowPolicy.find({ $or: [{ organizationId }, { organizationId: null }] }).sort({ category: 1, scope: 1 }).lean();
}

module.exports = { resolve, requiresApproval, upsert, list, defaults };
