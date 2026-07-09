const AIBusinessInsight = require("../../models/AIBusinessInsight");
const TrendAnalyzer = require("./AITrendAnalyzer");
const ExecutiveSummary = require("./AIExecutiveSummaryService");
const RecommendationEngine = require("./AIRecommendationEngine");
const Formatter = require("./AIInsightFormatter");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const RequestService = require("../ai/AIRequestService");
const { AppError } = require("../../utils/errorHandler");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

function answerQuestion(question, metrics, summary, recommendations) {
  const q = String(question || "").toLowerCase();
  if (!q.trim()) return "Ask a business question about revenue, renewals, customers, products, downloads, licenses, payments, or platform health.";
  if (q.includes("renewal")) {
    return `Renewals recorded: ${metrics.renewals.total}. Upcoming renewal attention: ${metrics.renewals.upcoming}. Expired licenses: ${metrics.licenses.statuses.expired || 0}.`;
  }
  if (q.includes("product") || q.includes("growing")) {
    const top = metrics.products.topBySales[0] || metrics.downloads.topProducts[0];
    return top ? `The strongest product signal is ${top.key}, with ${top.count} observed sales or download events in the selected range.` : "No product growth signal is available for this range.";
  }
  if (q.includes("customer") || q.includes("active")) {
    return `${metrics.customers.active} customers placed orders and ${metrics.customers.new} new organization members appeared in this range.`;
  }
  if (q.includes("week") || q.includes("changed")) {
    return `Revenue changed ${metrics.revenue.changePercent}% and paid orders changed ${metrics.orders.changePercent}% versus the prior comparable period. Downloads changed ${metrics.downloads.changePercent}%.`;
  }
  if (q.includes("focus") || q.includes("today")) {
    return recommendations[0] ? `Focus first on ${recommendations[0].title.toLowerCase()}: ${recommendations[0].action}` : summary.platformHealthSummary;
  }
  if (q.includes("revenue")) return summary.revenueSummary;
  if (q.includes("download")) return summary.downloadSummary;
  if (q.includes("license")) return summary.licenseSummary;
  return `${summary.revenueSummary} ${summary.growthSummary}`;
}

async function trackUsage({ actor, organizationId, promptTokens, completionTokens }, context = {}) {
  try {
    const tracked = await RequestService.simulateRequest({
      organizationId,
      providerId: "",
      modelId: "ai-business-insights-grounded",
      promptKey: "business.executive_insights",
      requestType: "analytics",
      promptTokens,
      completionTokens,
      responseTimeMs: 0,
    }, { actor, ip: context.ip, requestId: context.requestId });
    return { ...tracked.usage, providerId: tracked.providerId, modelId: "ai-business-insights-grounded" };
  } catch {
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimatedCost: 0, providerId: "unconfigured", modelId: "ai-business-insights-grounded" };
  }
}

async function persist({ actor, organizationId, type, question = "", formatted, usage }) {
  return AIBusinessInsight.create({
    organizationId,
    generatedBy: actor._id,
    type,
    question,
    timeRange: formatted.timeRange,
    modules: formatted.dataSources,
    summary: formatted.summary,
    recommendations: formatted.recommendations,
    supportingMetrics: formatted.supportingMetrics,
    dataSources: formatted.dataSources,
    confidenceLevel: formatted.confidenceLevel,
    knownLimitations: formatted.knownLimitations,
    visualization: formatted.visualization,
    providerId: usage.providerId,
    modelId: usage.modelId,
    promptTokens: usage.promptTokens || 0,
    completionTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
    estimatedCost: usage.estimatedCost || 0,
  });
}

async function dashboard({ actor, organizationId, period = "30d", start, end } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.analytics.read");
  const metrics = await TrendAnalyzer.analyze({ organizationId: orgId, period, start, end });
  const summary = ExecutiveSummary.generate(metrics);
  const recommendations = RecommendationEngine.generate(metrics);
  const formatted = Formatter.format({ metrics, summary, recommendations });
  const usage = await trackUsage({ actor, organizationId: orgId, promptTokens: 420, completionTokens: 320 }, context);
  const insight = await persist({ actor, organizationId: orgId, type: "executive_summary", formatted, usage });
  await Audit.record("ai.insight_generated", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { period } });
  if (recommendations.length) {
    await Audit.record("ai.recommendation_generated", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { count: recommendations.length } });
  }
  return { insightId: insight._id, metrics, ...formatted };
}

async function query({ actor, organizationId, question, period = "30d", start, end } = {}, context = {}) {
  if (!question || !String(question).trim()) throw new AppError("Business query is required.", 400);
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.analytics.read");
  const metrics = await TrendAnalyzer.analyze({ organizationId: orgId, period, start, end });
  const summary = ExecutiveSummary.generate(metrics);
  const recommendations = RecommendationEngine.generate(metrics);
  const answer = answerQuestion(question, metrics, summary, recommendations);
  const formatted = Formatter.format({ metrics, summary, recommendations, answer });
  const usage = await trackUsage({
    actor,
    organizationId: orgId,
    promptTokens: Math.ceil(String(question).length / 4) + 420,
    completionTokens: Math.ceil(answer.length / 4) + 240,
  }, context);
  const insight = await persist({ actor, organizationId: orgId, type: "business_query", question, formatted, usage });
  await Audit.record("ai.business_query_executed", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { question: String(question).slice(0, 120), period } });
  return { insightId: insight._id, ...formatted };
}

async function history({ actor, organizationId, limit = 25 } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.analytics.read");
  return AIBusinessInsight.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 25, 100)).lean();
}

module.exports = { dashboard, query, history, answerQuestion };
