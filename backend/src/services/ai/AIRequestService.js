const Audit = require("./AIAuditService");
const TokenTracker = require("./AITokenTracker");
const CostTracker = require("./AICostTracker");
const AIProviderConfig = require("../../models/AIProviderConfig");
const AIModel = require("../../models/AIModel");
const Permissions = require("./AIPermissionService");
const { AppError } = require("../../utils/errorHandler");

async function resolveProviderChain(organizationId, preferredProviderId = "") {
  const query = { organizationId, status: "configured" };
  const providers = await AIProviderConfig.find(query).sort({ fallbackOrder: 1, providerId: 1 }).select("+encryptedApiKey").lean();
  if (!providers.length) throw new AppError("No AI providers are configured.", 503);
  if (!preferredProviderId) return providers;
  const preferred = providers.find((provider) => provider.providerId === preferredProviderId);
  return preferred ? [preferred, ...providers.filter((provider) => provider.providerId !== preferredProviderId)] : providers;
}

async function simulateRequest(input = {}, context = {}) {
  const organizationId = input.organizationId;
  await Permissions.assert(context.actor, organizationId, "ai.use");
  const chain = await resolveProviderChain(organizationId, input.providerId);
  const selected = chain.find((provider) => provider.health?.status !== "unavailable") || chain[0];
  if (selected.providerId !== input.providerId && input.providerId) {
    await Audit.record("ai.provider_failover", { ...context, organizationId, metadata: { from: input.providerId, to: selected.providerId } });
  }
  const model = await AIModel.findOne({ organizationId, providerId: selected.providerId, modelId: input.modelId }).lean();
  const promptTokens = Number(input.promptTokens || 0);
  const completionTokens = Number(input.completionTokens || 0);
  const estimatedCost = CostTracker.estimateCost({ promptTokens, completionTokens, pricing: model?.pricing || {} });
  const usage = await TokenTracker.record({
    organizationId,
    userId: context.actor?._id || null,
    providerId: selected.providerId,
    modelId: input.modelId || model?.modelId || "unknown",
    promptKey: input.promptKey || "",
    requestType: input.requestType || "unknown",
    promptTokens,
    completionTokens,
    estimatedCost,
    responseTimeMs: Number(input.responseTimeMs || 0),
    status: "success",
    metadata: { simulated: true },
  });
  await Audit.record("ai.request", { ...context, organizationId, targetId: usage._id, metadata: { providerId: selected.providerId, modelId: usage.modelId, estimatedCost } });
  return { providerId: selected.providerId, usage };
}

module.exports = { resolveProviderChain, simulateRequest };
