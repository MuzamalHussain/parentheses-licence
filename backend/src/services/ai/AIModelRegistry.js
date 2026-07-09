const AIModel = require("../../models/AIModel");
const Audit = require("./AIAuditService");
const Permissions = require("./AIPermissionService");

async function registerModel(organizationId, input = {}, context = {}) {
  await Permissions.assert(context.actor, organizationId, "ai.model.manage");
  const model = await AIModel.findOneAndUpdate(
    { organizationId, providerId: input.providerId, modelId: input.modelId },
    {
      $set: {
        displayName: input.displayName || input.modelId,
        status: input.status || "disabled",
        isDefault: Boolean(input.isDefault),
        category: input.category || "general",
        modelTypes: input.modelTypes?.length ? input.modelTypes : ["chat"],
        version: input.version || "",
        contextWindow: Number(input.contextWindow || 0),
        capabilities: input.capabilities || [],
        pricing: input.pricing || {},
        metadata: input.metadata || {},
        updatedBy: context.actor?._id,
      },
      $setOnInsert: { organizationId, providerId: input.providerId, modelId: input.modelId },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  if (model.isDefault) {
    await AIModel.updateMany({ organizationId, _id: { $ne: model._id }, category: model.category }, { isDefault: false });
  }
  await Audit.record(model.status === "enabled" ? "ai.model_enabled" : "ai.model_updated", { ...context, organizationId, targetId: model._id, metadata: { providerId: model.providerId, modelId: model.modelId } });
  return model;
}

async function listModels(organizationId) {
  return AIModel.find({ organizationId }).sort({ providerId: 1, category: 1, modelId: 1 }).lean();
}

module.exports = { listModels, registerModel };
