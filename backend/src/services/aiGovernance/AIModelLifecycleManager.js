const AIModel = require("../../models/AIModel");
const Audit = require("../ai/AIAuditService");
const Permissions = require("../ai/AIPermissionService");

async function transition({ actor, organizationId, providerId, modelId, status, isDefault = false, priority = null, capabilities = null } = {}, context = {}) {
  await Permissions.assert(actor, organizationId, "ai.model.manage");
  const update = { status, isDefault: Boolean(isDefault), updatedBy: actor?._id };
  if (priority !== null) update["metadata.priority"] = Number(priority);
  if (capabilities) update.capabilities = capabilities;
  const model = await AIModel.findOneAndUpdate(
    { organizationId, providerId, modelId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!model) {
    const err = new Error("AI model not found.");
    err.statusCode = 404;
    throw err;
  }
  if (model.isDefault) {
    await AIModel.updateMany({ organizationId, _id: { $ne: model._id }, category: model.category }, { isDefault: false });
  }
  await Audit.record("ai.model_lifecycle_changed", { ...context, actor, organizationId, targetId: model._id, metadata: { providerId, modelId, status, isDefault: model.isDefault } });
  return model;
}

async function archive({ actor, organizationId, providerId, modelId } = {}, context = {}) {
  return transition({ actor, organizationId, providerId, modelId, status: "deprecated", isDefault: false }, context);
}

module.exports = { archive, transition };
