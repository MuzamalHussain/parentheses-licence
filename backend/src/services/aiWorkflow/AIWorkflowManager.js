const Permissions = require("../ai/AIPermissionService");
const Planner = require("./AIWorkflowPlanner");
const Queue = require("./AIApprovalQueue");
const Policy = require("./AIWorkflowPolicyService");
const Coordinator = require("./AIExecutionCoordinator");
const Templates = require("./AIWorkflowTemplates");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

async function plan({ actor, organizationId } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.workflow.manage");
  const planned = await Planner.plan({ organizationId: orgId });
  const created = [];
  for (const item of planned) {
    if (item.mode === "recommendation_only" || item.mode === "approval_required" || item.mode === "automatic_execution") {
      created.push(await Queue.create(item, actor, context));
    }
  }
  return { planned: created, templates: Templates.list() };
}

async function dashboard({ actor, organizationId } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.workflow.manage");
  const [approvals, policies] = await Promise.all([
    Queue.list({ organizationId: orgId }),
    Policy.list(orgId),
  ]);
  return { approvals, policies, templates: Templates.list() };
}

async function approve({ actor, id } = {}, context = {}) {
  await Permissions.assert(actor, actor?.activeOrganizationId, "ai.workflow.manage");
  return Queue.approve(id, actor, context);
}

async function reject({ actor, id } = {}, context = {}) {
  await Permissions.assert(actor, actor?.activeOrganizationId, "ai.workflow.manage");
  return Queue.reject(id, actor, context);
}

async function execute({ actor, id } = {}, context = {}) {
  await Permissions.assert(actor, actor?.activeOrganizationId, "ai.workflow.manage");
  return Coordinator.executeApproval(id, actor, context);
}

async function updatePolicy({ actor, input } = {}, context = {}) {
  const orgId = orgFor(actor, input.organizationId);
  await Permissions.assert(actor, orgId, "ai.workflow.manage");
  return Policy.upsert({ ...input, organizationId: orgId }, { ...context, actor });
}

module.exports = { plan, dashboard, approve, reject, execute, updatePolicy };
