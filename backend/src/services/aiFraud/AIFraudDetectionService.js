const AIFraudRisk = require("../../models/AIFraudRisk");
const Analyzer = require("./AISecurityAnalyzer");
const Recommendations = require("./AIRiskRecommendationService");
const Reports = require("./AIFraudReportService");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const RequestService = require("../ai/AIRequestService");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

async function trackUsage({ actor, organizationId, risks }, context = {}) {
  try {
    const tracked = await RequestService.simulateRequest({
      organizationId,
      providerId: "",
      modelId: "ai-fraud-security-grounded",
      promptKey: "security.fraud_detection",
      requestType: "security_analysis",
      promptTokens: 500 + risks.length * 40,
      completionTokens: 300 + risks.length * 30,
      responseTimeMs: 0,
    }, { actor, ip: context.ip, requestId: context.requestId });
    return tracked.usage;
  } catch {
    return { promptTokens: 500, completionTokens: 300, totalTokens: 800, estimatedCost: 0 };
  }
}

async function persistRisks({ actor, organizationId, risks }) {
  const created = [];
  for (const risk of risks) {
    created.push(await AIFraudRisk.create({
      ...risk,
      generatedBy: actor._id,
      recommendations: Recommendations.forRisk(risk),
    }));
  }
  return created;
}

async function dashboard({ actor, organizationId, period = "7d", start, end } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.security.read");
  const analysis = await Analyzer.analyze({ organizationId: orgId, period, start, end });
  const recommendations = Recommendations.generate(analysis.risks);
  const persisted = await persistRisks({ actor, organizationId: orgId, risks: analysis.risks });
  await trackUsage({ actor, organizationId: orgId, risks: analysis.risks }, context);
  await Audit.record("ai.security_analysis_executed", { actor, organizationId: orgId, ip: context.ip, requestId: context.requestId, metadata: { period, risks: analysis.risks.length } });
  if (persisted.length) {
    await Audit.record("ai.risk_generated", { actor, organizationId: orgId, targetId: persisted[0]._id, ip: context.ip, requestId: context.requestId, metadata: { count: persisted.length } });
    await Audit.record("ai.fraud_alert_created", { actor, organizationId: orgId, targetId: persisted[0]._id, ip: context.ip, requestId: context.requestId, metadata: { highOrCritical: analysis.risks.filter((risk) => ["high", "critical"].includes(risk.riskLevel)).length } });
  }
  if (recommendations.length) {
    await Audit.record("ai.security_recommendation_generated", { actor, organizationId: orgId, ip: context.ip, requestId: context.requestId, metadata: { count: recommendations.length } });
  }
  return Reports.summarize(persisted.map((risk, index) => ({ ...analysis.risks[index], _id: risk._id, recommendations: risk.recommendations })), recommendations, analysis);
}

async function history({ actor, organizationId, limit = 50 } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.security.read");
  return AIFraudRisk.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 100)).lean();
}

module.exports = { dashboard, history };
