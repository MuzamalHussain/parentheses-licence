const priorityRank = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

function recommendation({ priority, reason, evidence, confidenceScore = 70, businessImpact, suggestedAction }) {
  return { priority, reason, evidence, confidenceScore, businessImpact, suggestedAction, automaticAction: false };
}

function generate(data, alerts = []) {
  const recs = [];
  for (const alert of alerts) {
    recs.push(recommendation({
      priority: alert.level,
      reason: alert.message,
      evidence: alert.evidence,
      confidenceScore: alert.level === "critical" ? 95 : alert.level === "high" ? 85 : 70,
      businessImpact: alert.source === "security" ? "Security and trust risk" : alert.source === "payments" ? "Revenue recovery opportunity" : "Operational reliability",
      suggestedAction: alert.source === "ai_workflows" ? "Review pending AI workflow approvals." : `Review ${alert.source} details in the relevant dashboard.`,
    }));
  }
  if ((data.business?.renewals || 0) > 0) {
    recs.push(recommendation({
      priority: "medium",
      reason: `${data.business.renewals} renewals were detected in the analytics window.`,
      evidence: { renewals: data.business.renewals },
      confidenceScore: 75,
      businessImpact: "Customer retention",
      suggestedAction: "Review renewal follow-up workflows and notification coverage.",
    }));
  }
  if ((data.aiProviders?.estimatedCost || 0) > 0) {
    recs.push(recommendation({
      priority: data.aiProviders.estimatedCost > 25 ? "high" : "low",
      reason: `AI estimated cost is ${data.aiProviders.estimatedCost.toFixed(4)} for recent usage.`,
      evidence: { estimatedCost: data.aiProviders.estimatedCost, totalTokens: data.aiProviders.totalTokens },
      confidenceScore: 80,
      businessImpact: "AI operating cost",
      suggestedAction: "Review provider usage, fallback events, and prompt efficiency.",
    }));
  }
  return recs.sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)).slice(0, 12);
}

module.exports = { generate };
