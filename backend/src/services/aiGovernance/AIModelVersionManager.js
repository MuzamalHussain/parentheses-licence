const AIModel = require("../../models/AIModel");
const ModelRegistry = require("../ai/AIModelRegistry");

async function createVersion({ actor, organizationId, providerId, baseModelId, newModelId, version, metadata = {} } = {}, context = {}) {
  const base = await AIModel.findOne({ organizationId, providerId, modelId: baseModelId }).lean();
  return ModelRegistry.registerModel(organizationId, {
    providerId,
    modelId: newModelId,
    displayName: metadata.displayName || newModelId,
    status: "disabled",
    isDefault: false,
    category: base?.category || metadata.category || "general",
    modelTypes: base?.modelTypes || metadata.modelTypes || ["chat"],
    version,
    contextWindow: base?.contextWindow || metadata.contextWindow || 0,
    capabilities: metadata.capabilities || base?.capabilities || [],
    pricing: metadata.pricing || base?.pricing || {},
    metadata: { ...(base?.metadata || {}), ...metadata, parentModelId: baseModelId },
  }, context);
}

async function listVersions(organizationId, providerId, modelIdPrefix = "") {
  const filter = { organizationId, providerId };
  if (modelIdPrefix) filter.modelId = new RegExp(`^${String(modelIdPrefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return AIModel.find(filter).sort({ modelId: 1, version: -1 }).lean();
}

module.exports = { createVersion, listVersions };
