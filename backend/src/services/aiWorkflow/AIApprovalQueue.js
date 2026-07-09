const AIWorkflowApproval = require("../../models/AIWorkflowApproval");
const Audit = require("../ai/AIAuditService");
const { AppError } = require("../../utils/errorHandler");

async function create(item, actor, context = {}) {
  const doc = await AIWorkflowApproval.create({ status: "pending", mode: item.mode || "approval_required", ...item, generatedBy: actor._id });
  await Audit.record("ai.workflow_suggested", { actor, organizationId: doc.organizationId, targetId: doc._id, ip: context.ip, requestId: context.requestId, metadata: { category: doc.category, mode: doc.mode } });
  return doc;
}

async function list({ organizationId, status } = {}) {
  const filter = { organizationId };
  if (status) filter.status = status;
  return AIWorkflowApproval.find(filter).sort({ createdAt: -1 }).limit(100).lean();
}

async function approve(id, actor, context = {}) {
  const doc = await AIWorkflowApproval.findById(id);
  if (!doc) throw new AppError("AI workflow approval not found.", 404);
  if (doc.status !== "pending") throw new AppError("Only pending AI workflows can be approved.", 422);
  doc.status = "approved";
  doc.approvedBy = actor._id;
  doc.approvedAt = new Date();
  await doc.save();
  await Audit.record("ai.workflow_approved", { actor, organizationId: doc.organizationId, targetId: doc._id, ip: context.ip, requestId: context.requestId });
  return doc;
}

async function reject(id, actor, context = {}) {
  const doc = await AIWorkflowApproval.findById(id);
  if (!doc) throw new AppError("AI workflow approval not found.", 404);
  if (doc.status !== "pending") throw new AppError("Only pending AI workflows can be rejected.", 422);
  doc.status = "rejected";
  doc.rejectedBy = actor._id;
  doc.rejectedAt = new Date();
  await doc.save();
  await Audit.record("ai.workflow_rejected", { actor, organizationId: doc.organizationId, targetId: doc._id, ip: context.ip, requestId: context.requestId });
  return doc;
}

module.exports = { create, list, approve, reject };
