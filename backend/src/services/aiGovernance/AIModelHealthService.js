const AIUsageLog = require("../../models/AIUsageLog");
const AIModel = require("../../models/AIModel");

async function health({ organizationId, providerId = "", modelId = "" } = {}) {
  const filter = { organizationId };
  if (providerId) filter.providerId = providerId;
  if (modelId) filter.modelId = modelId;
  const [models, usage] = await Promise.all([
    AIModel.find(providerId || modelId ? filter : { organizationId }).lean().catch(() => []),
    AIUsageLog.find(filter).sort({ createdAt: -1 }).limit(500).lean().catch(() => []),
  ]);
  const failures = usage.filter((row) => row.status === "failed").length;
  const fallbackEvents = usage.filter((row) => row.status === "fallback").length;
  const avgLatency = usage.length ? Math.round(usage.reduce((sum, row) => sum + Number(row.responseTimeMs || 0), 0) / usage.length) : 0;
  return {
    models,
    requests: usage.length,
    failures,
    fallbackEvents,
    errorRate: usage.length ? Math.round((failures / usage.length) * 10000) / 100 : 0,
    averageLatencyMs: avgLatency,
    totalTokens: usage.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
    estimatedCost: usage.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0),
    availability: failures > usage.length / 2 && usage.length ? "degraded" : "available",
  };
}

module.exports = { health };
