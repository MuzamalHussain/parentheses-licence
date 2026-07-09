function recommendation(key, action, priority, rationale, evidence) {
  return { key, action, priority, rationale, evidence, automaticAction: false };
}

function forRisk(risk) {
  const recs = [];
  if (risk.entityType === "account" && risk.score >= 40) {
    recs.push(recommendation("require_mfa", "Require MFA", risk.riskLevel, "Account risk includes failed login, replay, reset, or session-change signals.", risk.evidence));
  }
  if (risk.entityType === "api_key" && risk.score >= 20) {
    recs.push(recommendation("rotate_api_keys", "Rotate API Keys", risk.riskLevel, "API keys show broad scope, high usage, or authentication-failure signals.", risk.evidence));
  }
  if (risk.entityType === "license" && risk.score >= 40) {
    recs.push(recommendation("review_license", "Review License", risk.riskLevel, "License activation evidence suggests sharing or activation limit abuse.", risk.evidence));
    recs.push(recommendation("suspend_license_recommendation", "Suspend License", "high", "Suspension is recommendation-only and requires an administrator decision.", risk.evidence));
  }
  if (risk.entityType === "download" && risk.score >= 20) {
    recs.push(recommendation("monitor_downloads", "Monitor Activity", risk.riskLevel, "Download records show abnormal frequency or denied request patterns.", risk.evidence));
  }
  if (risk.entityType === "payment" && risk.score >= 20) {
    recs.push(recommendation("review_payment_activity", "Review Account", risk.riskLevel, "Payment records include failures, refunds, or failed-order patterns.", risk.evidence));
  }
  if (!recs.length) {
    recs.push(recommendation("monitor_activity", "Monitor Activity", "low", "Risk is currently low but has recorded evidence.", risk.evidence));
  }
  return recs;
}

function generate(risks = []) {
  return risks.flatMap((risk) => forRisk(risk).map((rec) => ({ ...rec, riskTitle: risk.title, entityType: risk.entityType, entityId: risk.entityId })));
}

module.exports = { forRisk, generate };
