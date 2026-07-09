const AIReleaseInsight = require("../../models/AIReleaseInsight");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const Analyzer = require("./AIReleaseAnalyzer");
const Compatibility = require("./AICompatibilityAnalyzer");
const Risk = require("./AIRiskAssessmentService");
const Notes = require("./AIReleaseNotesGenerator");
const Rollout = require("./AIRolloutAdvisor");
const Health = require("./AIReleaseHealthService");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

async function analyze({ actor, organizationId, productId, versionId } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.release.read");
  const loaded = await Analyzer.loadRelease({ productId, versionId, organizationId: orgId });
  const releaseAnalysis = Analyzer.analyze(loaded);
  const compatibility = await Compatibility.analyze({ ...loaded, organizationId: orgId });
  const riskAssessment = Risk.assess({ releaseAnalysis, compatibility });
  const releaseNotes = Notes.generate({ releaseAnalysis, compatibility, riskAssessment });
  const rolloutStrategy = Rollout.recommend({ releaseAnalysis, riskAssessment });
  const releaseHealth = await Health.health({ ...loaded, organizationId: orgId });
  const insight = await AIReleaseInsight.create({
    organizationId: orgId,
    productId,
    pluginVersionId: versionId,
    generatedBy: actor._id,
    releaseAnalysis,
    compatibility,
    riskAssessment,
    releaseNotes,
    rolloutStrategy,
    releaseHealth,
  });
  await Audit.record("ai.release_analysis_generated", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { productId, versionId } });
  await Audit.record("ai.release_risk_assessment_created", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { riskLevel: riskAssessment.riskLevel } });
  await Audit.record("ai.release_notes_generated", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId });
  await Audit.record("ai.release_rollout_recommendation_created", { actor, organizationId: orgId, targetId: insight._id, ip: context.ip, requestId: context.requestId, metadata: { strategy: rolloutStrategy.strategy } });
  return { insightId: insight._id, releaseAnalysis, compatibility, riskAssessment, releaseNotes, rolloutStrategy, releaseHealth };
}

async function history({ actor, organizationId, productId, limit = 25 } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.release.read");
  const filter = { organizationId: orgId };
  if (productId) filter.productId = productId;
  return AIReleaseInsight.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 25, 100)).lean();
}

module.exports = { analyze, history };
