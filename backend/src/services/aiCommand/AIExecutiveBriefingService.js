function generate(data, alerts, recommendations) {
  return {
    dailySummary: `${alerts.length} operational alerts, ${data.workflow?.pendingApprovals || 0} pending AI workflow approvals, and ${data.security?.riskCounts?.high || 0} high security risks require review.`,
    revenueSummary: `Revenue is ${Number(data.business?.revenue || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} across ${data.business?.orders || 0} orders in the analytics window.`,
    renewalSummary: `${data.business?.renewals || 0} renewals and ${data.business?.customerGrowth || 0} new customers were observed.`,
    platformHealth: `API requests: ${data.operations?.api?.totalRequests || 0}; failed workflows: ${data.workflow?.failedWorkflows || 0}; failed payments: ${data.operations?.payments?.failedPayments || 0}.`,
    securitySummary: `${data.security?.riskCounts?.critical || 0} critical, ${data.security?.riskCounts?.high || 0} high, and ${data.security?.riskCounts?.medium || 0} medium risks are open.`,
    aiUsageSummary: `${data.aiProviders?.totalTokens || 0} AI tokens used with estimated cost ${Number(data.aiProviders?.estimatedCost || 0).toFixed(4)} and ${data.aiProviders?.fallbackEvents || 0} fallback events.`,
    recommendedActions: recommendations.slice(0, 5).map((item) => item.suggestedAction),
  };
}

module.exports = { generate };
