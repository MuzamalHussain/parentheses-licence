const AIUsageLog = require("../../models/AIUsageLog");

function normalizeUsage(input = {}) {
  const promptTokens = Number(input.promptTokens || 0);
  const completionTokens = Number(input.completionTokens || 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(input.totalTokens || promptTokens + completionTokens),
  };
}

async function record(input = {}) {
  const usage = normalizeUsage(input);
  return AIUsageLog.create({
    ...input,
    ...usage,
    estimatedCost: Number(input.estimatedCost || 0),
  });
}

async function summary(organizationId) {
  const rows = await AIUsageLog.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { providerId: "$providerId", modelId: "$modelId" },
        requests: { $sum: 1 },
        promptTokens: { $sum: "$promptTokens" },
        completionTokens: { $sum: "$completionTokens" },
        totalTokens: { $sum: "$totalTokens" },
        estimatedCost: { $sum: "$estimatedCost" },
        averageResponseTimeMs: { $avg: "$responseTimeMs" },
      },
    },
  ]);
  return rows.map((row) => ({ providerId: row._id.providerId, modelId: row._id.modelId, ...row, _id: undefined }));
}

module.exports = { normalizeUsage, record, summary };
