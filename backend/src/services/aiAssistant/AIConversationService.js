const AIConversation = require("../../models/AIConversation");
const AIModel = require("../../models/AIModel");
const AIProviderConfig = require("../../models/AIProviderConfig");
const Assistant = require("./AILicensingAssistant");
const RequestService = require("../ai/AIRequestService");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");

async function resolveProviderAndModel(organizationId, preferred = {}) {
  const provider = preferred.providerId
    ? await AIProviderConfig.findOne({ organizationId, providerId: preferred.providerId, status: "configured" }).lean()
    : await AIProviderConfig.findOne({ organizationId, status: "configured" }).sort({ fallbackOrder: 1 }).lean();
  const model = preferred.modelId
    ? await AIModel.findOne({ organizationId, modelId: preferred.modelId, status: "enabled" }).lean()
    : await AIModel.findOne({ organizationId, status: "enabled", isDefault: true }).lean()
      || await AIModel.findOne({ organizationId, status: "enabled" }).lean();
  return {
    providerId: provider?.providerId || preferred.providerId || "unconfigured",
    modelId: model?.modelId || preferred.modelId || "assistant-grounded-response",
  };
}

async function ask({ actor, organizationId, audience = "customer", question, conversationId = null, providerId = "", modelId = "" } = {}, reqContext = {}) {
  await Permissions.assert(actor, organizationId || actor.activeOrganizationId, "ai.use");
  const orgId = organizationId || actor.activeOrganizationId || null;
  const result = await Assistant.answer({ actor, organizationId: orgId, audience, question }, reqContext);
  const selected = await resolveProviderAndModel(orgId, { providerId, modelId });
  let usage = null;
  try {
    const tracked = await RequestService.simulateRequest({
      organizationId: orgId,
      providerId: selected.providerId === "unconfigured" ? "" : selected.providerId,
      modelId: selected.modelId,
      promptKey: result.promptKey,
      requestType: "chat",
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      responseTimeMs: 0,
    }, { actor, ip: reqContext.ip, requestId: reqContext.requestId });
    usage = tracked.usage;
    selected.providerId = tracked.providerId;
  } catch {
    usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens, totalTokens: result.totalTokens, estimatedCost: 0 };
  }

  const conversation = conversationId
    ? await AIConversation.findOne({ _id: conversationId, ...(audience === "admin" && actor.role === "admin" ? { organizationId: orgId } : { userId: actor._id }) })
    : new AIConversation({ organizationId: orgId, userId: actor._id, audience, title: String(question || "AI Assistant").slice(0, 120), category: result.category });
  if (!conversation) throw new Error("AI conversation not found.");
  conversation.messages = conversation.messages || [];

  conversation.messages.push({ role: "user", content: question, contextSummary: result.contextSummary });
  conversation.messages.push({
    role: "assistant",
    content: result.response,
    contextSummary: result.contextSummary,
    providerId: selected.providerId,
    modelId: selected.modelId,
    promptTokens: usage.promptTokens || result.promptTokens,
    completionTokens: usage.completionTokens || result.completionTokens,
    totalTokens: usage.totalTokens || result.totalTokens,
    estimatedCost: usage.estimatedCost || 0,
    suggestedActions: result.suggestedActions,
  });
  conversation.lastProviderId = selected.providerId;
  conversation.lastModelId = selected.modelId;
  conversation.totalPromptTokens += usage.promptTokens || result.promptTokens;
  conversation.totalCompletionTokens += usage.completionTokens || result.completionTokens;
  conversation.totalEstimatedCost += usage.estimatedCost || 0;
  conversation.lastMessageAt = new Date();
  await conversation.save();
  await Audit.record("ai.assistant_question_answered", { actor, organizationId: orgId, targetId: conversation._id, ip: reqContext.ip, requestId: reqContext.requestId, metadata: { audience, category: result.category } });
  return { conversation, answer: result.response, suggestedActions: result.suggestedActions, contextSummary: result.contextSummary };
}

async function list({ actor, organizationId, audience = "customer" } = {}) {
  const filter = audience === "admin" && actor.role === "admin"
    ? { organizationId }
    : { userId: actor._id };
  return AIConversation.find(filter).sort({ lastMessageAt: -1 }).limit(50).lean();
}

async function stats(organizationId) {
  const rows = await AIConversation.find({ organizationId }).sort({ lastMessageAt: -1 }).limit(200).lean();
  const topQuestions = rows.flatMap((row) => row.messages || [])
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .slice(0, 10);
  return {
    conversations: rows.length,
    totalPromptTokens: rows.reduce((sum, row) => sum + Number(row.totalPromptTokens || 0), 0),
    totalCompletionTokens: rows.reduce((sum, row) => sum + Number(row.totalCompletionTokens || 0), 0),
    totalEstimatedCost: rows.reduce((sum, row) => sum + Number(row.totalEstimatedCost || 0), 0),
    topQuestions,
    recent: rows.slice(0, 20),
  };
}

module.exports = { ask, list, resolveProviderAndModel, stats };
