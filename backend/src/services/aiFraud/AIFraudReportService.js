function summarize(risks = [], recommendations = [], analysis) {
  const counts = risks.reduce((out, risk) => ({ ...out, [risk.riskLevel]: (out[risk.riskLevel] || 0) + 1 }), { low: 0, medium: 0, high: 0, critical: 0 });
  return {
    title: "AI Fraud Detection & Security Intelligence",
    generatedAt: new Date(),
    timeRange: analysis.timeRange,
    counts,
    currentRisks: risks,
    topThreats: analysis.topThreats,
    highRiskLicenses: analysis.highRiskLicenses,
    highRiskOrganizations: analysis.highRiskOrganizations,
    recentSecurityEvents: analysis.recentSecurityEvents,
    riskTrends: analysis.riskTrends,
    recommendations,
    explainability: {
      dataSources: ["licenses", "license_sites", "downloads", "payments", "orders", "users", "audit_logs", "api_keys"],
      limitations: [
        "Risk scores are rule-based and descriptive.",
        "No machine learning training or external threat intelligence feeds are used.",
        "Administrative actions are recommendations only and are never executed automatically.",
      ],
    },
  };
}

module.exports = { summarize };
