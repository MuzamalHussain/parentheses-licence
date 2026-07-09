const AIManager = require("../ai/AIManager");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const AIGovernancePolicy = require("../../models/AIGovernancePolicy");
const Policy = require("./AIPolicyEngine");
const Approvals = require("./AIApprovalService");
const Compliance = require("./AIComplianceService");
const ModelHealth = require("./AIModelHealthService");
const Routing = require("./AIProviderRoutingService");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

async function dashboard({ actor, organizationId } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.governance.manage");
  const [overview, policy, approvals, compliance, modelHealth, routing] = await Promise.all([
    AIManager.overview(orgId, { actor }).catch(() => ({ providers: [], models: [], prompts: [], usage: [], supportedProviders: [] })),
    Policy.getPolicy(orgId),
    Approvals.listApprovals(orgId).catch(() => []),
    Compliance.compliance({ organizationId: orgId, limit: 200 }),
    ModelHealth.health({ organizationId: orgId }),
    Routing.route({ organizationId: orgId, capability: "chat", strategy: "priority" }).catch(() => ({ selected: null, fallbackChain: [] })),
  ]);
  await Audit.record("ai.governance_dashboard_viewed", { ...context, actor, organizationId: orgId });
  return {
    overview,
    policy,
    approvals,
    compliance,
    modelHealth,
    routing,
    monitoring: {
      requests: compliance.totals.requests,
      errors: compliance.totals.failures,
      tokenUsage: compliance.totals.tokens,
      estimatedCost: compliance.totals.estimatedCost,
      fallbackEvents: modelHealth.fallbackEvents,
      averageLatencyMs: modelHealth.averageLatencyMs,
      modelAvailability: modelHealth.availability,
    },
  };
}

async function savePolicy({ actor, organizationId, input = {} } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.governance.manage");
  const policy = await AIGovernancePolicy.findOneAndUpdate(
    { organizationId: orgId, name: input.name || "Default AI Governance Policy" },
    { $set: { ...input, organizationId: orgId, updatedBy: actor?._id }, $setOnInsert: { name: input.name || "Default AI Governance Policy" } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Audit.record("ai.governance_policy_updated", { ...context, actor, organizationId: orgId, targetId: policy._id });
  return policy;
}

async function enforce({ actor, organizationId, estimatedCost = 0 } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.governance.manage");
  const result = await Policy.enforceBudget({ organizationId: orgId, userId: actor?._id, estimatedCost });
  await Audit.record("ai.governance_policy_enforced", { ...context, actor, organizationId: orgId, metadata: { allowed: result.allowed, violations: result.violations } });
  return result;
}

module.exports = { dashboard, enforce, savePolicy };
