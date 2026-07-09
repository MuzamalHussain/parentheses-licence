const Snapshot = require("../../models/AICommandCenterSnapshot");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const Aggregator = require("./AIOperationsAggregator");
const HealthSummary = require("./AIHealthSummaryService");
const Recommendations = require("./AIRecommendationCenter");
const Briefing = require("./AIExecutiveBriefingService");
const { getCached } = require("../../utils/ttlCache");
const performanceConfig = require("../../config/performance");
const { AppError } = require("../../utils/errorHandler");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

function answerQuestion(question, dashboard) {
  const q = String(question || "").toLowerCase();
  if (q.includes("attention")) return dashboard.briefing.dailySummary;
  if (q.includes("critical")) return dashboard.alerts.filter((item) => item.level === "critical" || item.level === "high").map((item) => `${item.title}: ${item.message}`).join("\n") || "No critical or high alerts are currently present.";
  if (q.includes("overnight")) return `${dashboard.briefing.platformHealth} ${dashboard.briefing.securitySummary}`;
  if (q.includes("ai costs") || q.includes("cost")) return dashboard.briefing.aiUsageSummary;
  if (q.includes("workflow")) return `${dashboard.workflow.pendingApprovals} approvals are waiting and ${dashboard.workflow.failedWorkflows} workflows are failed.`;
  return dashboard.briefing.dailySummary;
}

async function buildDashboard({ actor, organizationId, force = false } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.operations.read");
  const factory = async () => {
    const aggregate = await Aggregator.aggregate({ organizationId: orgId, actor });
    const health = HealthSummary.fromAggregates(aggregate);
    const recommendations = Recommendations.generate(aggregate, health.alerts);
    const briefing = Briefing.generate(aggregate, health.alerts, recommendations);
    const snapshot = await Snapshot.create({
      organizationId: orgId,
      generatedBy: actor._id,
      summary: briefing,
      alerts: health.alerts,
      recommendations,
      health: health.health,
      aiUsage: aggregate.aiProviders,
      workflow: aggregate.workflow,
      security: aggregate.security,
      business: aggregate.business,
    }).catch(() => null);
    await Audit.record("ai.command_center.health_scan_completed", { actor, organizationId: orgId, targetId: snapshot?._id || orgId, ip: context.ip, requestId: context.requestId, metadata: { alerts: health.alerts.length } });
    await Audit.record("ai.command_center.executive_brief_generated", { actor, organizationId: orgId, targetId: snapshot?._id || orgId, ip: context.ip, requestId: context.requestId, metadata: { recommendations: recommendations.length } });
    if (recommendations.length) await Audit.record("ai.command_center.recommendation_generated", { actor, organizationId: orgId, targetId: snapshot?._id || orgId, ip: context.ip, requestId: context.requestId, metadata: { count: recommendations.length } });
    if ((aggregate.aiProviders?.fallbackEvents || 0) > 0) await Audit.record("ai.provider_failover", { actor, organizationId: orgId, targetId: snapshot?._id || orgId, ip: context.ip, requestId: context.requestId, metadata: { fallbackEvents: aggregate.aiProviders.fallbackEvents } });
    return {
      snapshotId: snapshot?._id || null,
      generatedAt: aggregate.generatedAt,
      briefing,
      alerts: health.alerts,
      recommendations,
      health: health.health,
      aiProviders: aggregate.aiProviders,
      workflow: aggregate.workflow,
      security: aggregate.security,
      business: aggregate.business,
    };
  };
  if (force) return factory();
  return getCached(`ai-command:${orgId || "global"}:dashboard`, performanceConfig.cache.dashboardTtlMs, factory);
}

async function command({ actor, organizationId, question } = {}, context = {}) {
  if (!question || !String(question).trim()) throw new AppError("Command center question is required.", 400);
  const dashboard = await buildDashboard({ actor, organizationId, force: true }, context);
  const answer = answerQuestion(question, dashboard);
  await Snapshot.create({
    organizationId: orgFor(actor, organizationId),
    generatedBy: actor._id,
    summary: dashboard.briefing,
    alerts: dashboard.alerts,
    recommendations: dashboard.recommendations,
    health: dashboard.health,
    aiUsage: dashboard.aiProviders,
    workflow: dashboard.workflow,
    security: dashboard.security,
    business: dashboard.business,
    question,
    answer,
  }).catch(() => null);
  return { answer, supportingEvidence: { alerts: dashboard.alerts.slice(0, 5), recommendations: dashboard.recommendations.slice(0, 5) }, dashboard };
}

module.exports = { buildDashboard, command, answerQuestion };
