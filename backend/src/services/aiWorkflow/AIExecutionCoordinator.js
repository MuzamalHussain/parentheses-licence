const AIWorkflowApproval = require("../../models/AIWorkflowApproval");
const WorkflowEngine = require("../workflows/WorkflowEngine");
const Policy = require("./AIWorkflowPolicyService");
const Audit = require("../ai/AIAuditService");
const { AppError } = require("../../utils/errorHandler");

async function executeApproval(id, actor, context = {}) {
  const doc = await AIWorkflowApproval.findById(id);
  if (!doc) throw new AppError("AI workflow approval not found.", 404);
  if (!["approved", "pending"].includes(doc.status)) throw new AppError("AI workflow cannot be executed in its current state.", 422);
  const policy = await Policy.resolve({ organizationId: doc.organizationId, category: doc.category });
  if (doc.status !== "approved" && Policy.requiresApproval(policy, doc.plan)) {
    throw new AppError("AI workflow requires approval before execution.", 403);
  }
  const results = [];
  for (const step of doc.plan || []) {
    if (step.restricted) throw new AppError("Restricted AI workflow steps require a dedicated manual action.", 403);
    results.push(await WorkflowEngine.dispatch(step.eventName, step.payload || {}, {
      actor,
      requestId: context.requestId,
      ip: context.ip,
      metadata: { aiWorkflowApprovalId: doc._id, templateKey: doc.templateKey },
      idempotencyKey: `ai-workflow:${doc._id}:${step.key}`,
    }));
  }
  doc.status = "executed";
  doc.executedBy = actor._id;
  doc.executedAt = new Date();
  doc.workflowResults = results;
  await doc.save();
  await Audit.record("ai.workflow_executed", { actor, organizationId: doc.organizationId, targetId: doc._id, ip: context.ip, requestId: context.requestId, metadata: { results: results.length } });
  return doc;
}

module.exports = { executeApproval };
