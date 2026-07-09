const AIUsageLog = require("../../models/AIUsageLog");
const AIPromptTemplate = require("../../models/AIPromptTemplate");
const AIPromptApproval = require("../../models/AIPromptApproval");

async function compliance({ organizationId, limit = 200 } = {}) {
  const [usage, prompts, approvals] = await Promise.all([
    AIUsageLog.find({ organizationId }).sort({ createdAt: -1 }).limit(limit).lean().catch(() => []),
    AIPromptTemplate.find({ organizationId }).sort({ updatedAt: -1 }).limit(100).lean().catch(() => []),
    AIPromptApproval.find({ organizationId }).sort({ updatedAt: -1 }).limit(100).lean().catch(() => []),
  ]);
  return {
    requestLog: usage.map((row) => ({
      id: row._id,
      providerId: row.providerId,
      modelId: row.modelId,
      promptKey: row.promptKey,
      requestType: row.requestType,
      tokenUsage: row.totalTokens,
      estimatedCost: row.estimatedCost,
      latency: row.responseTimeMs,
      status: row.status,
      createdAt: row.createdAt,
    })),
    promptInventory: prompts.map((prompt) => ({ id: prompt._id, key: prompt.key, version: prompt.version, status: prompt.status, category: prompt.category })),
    approvalTrail: approvals,
    totals: {
      requests: usage.length,
      tokens: usage.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
      estimatedCost: usage.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0),
      failures: usage.filter((row) => row.status === "failed").length,
    },
  };
}

module.exports = { compliance };
