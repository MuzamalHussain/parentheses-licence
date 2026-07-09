function item({ key, title, priority = "medium", rationale, action, evidence, confidence = "medium" }) {
  return { key, title, priority, rationale, action, evidence, confidence };
}

function generate(metrics) {
  const recommendations = [];

  if (metrics.payments.failed > 0) {
    recommendations.push(item({
      key: "payment_recovery",
      title: "Review failed payments",
      priority: metrics.payments.failed >= 5 ? "high" : "medium",
      rationale: `${metrics.payments.failed} failed payments were recorded in the selected period.`,
      action: "Use the payment monitor to inspect failed transactions and retry eligible customer payments.",
      evidence: { failedPayments: metrics.payments.failed, totalPayments: metrics.payments.total },
      confidence: metrics.payments.total ? "high" : "medium",
    }));
  }

  if ((metrics.licenses.statuses.expired || 0) > 0 || metrics.renewals.upcoming > 0) {
    recommendations.push(item({
      key: "renewal_improvements",
      title: "Prioritize renewal outreach",
      priority: metrics.renewals.upcoming >= 10 ? "high" : "medium",
      rationale: `${metrics.renewals.upcoming} licenses are approaching renewal and ${metrics.licenses.statuses.expired || 0} licenses are expired.`,
      action: "Segment expiring licenses and prepare renewal messaging through the notification center.",
      evidence: { upcomingRenewals: metrics.renewals.upcoming, expiredLicenses: metrics.licenses.statuses.expired || 0 },
      confidence: "medium",
    }));
  }

  if (metrics.downloads.changePercent > 25) {
    recommendations.push(item({
      key: "product_adoption",
      title: "Investigate rising product adoption",
      priority: "medium",
      rationale: `Downloads increased by ${metrics.downloads.changePercent}% over the prior period.`,
      action: "Review top downloaded products and version adoption before the next release cycle.",
      evidence: { downloads: metrics.downloads.total, previousDownloads: metrics.downloads.previousTotal },
      confidence: metrics.downloads.total >= 10 ? "high" : "medium",
    }));
  }

  if (metrics.orders.changePercent < -20 || metrics.revenue.changePercent < -20) {
    recommendations.push(item({
      key: "revenue_optimization",
      title: "Review revenue conversion",
      priority: "high",
      rationale: `Revenue changed by ${metrics.revenue.changePercent}% and paid orders changed by ${metrics.orders.changePercent}% versus the prior period.`,
      action: "Compare order status, coupon usage, and payment failures for conversion blockers.",
      evidence: { revenue: metrics.revenue.total, previousRevenue: metrics.revenue.previousTotal, paidOrders: metrics.orders.paid, previousPaidOrders: metrics.orders.previousPaid },
      confidence: "medium",
    }));
  }

  if (metrics.downloads.denied > 0) {
    recommendations.push(item({
      key: "activation_optimization",
      title: "Reduce denied download attempts",
      priority: metrics.downloads.denied >= 10 ? "high" : "medium",
      rationale: `${metrics.downloads.denied} download requests were denied in the selected period.`,
      action: "Inspect entitlement, license, and channel eligibility failures in download history.",
      evidence: { deniedDownloads: metrics.downloads.denied, totalDownloads: metrics.downloads.total },
      confidence: "high",
    }));
  }

  if (!recommendations.length) {
    recommendations.push(item({
      key: "steady_state",
      title: "Maintain current operating rhythm",
      priority: "low",
      rationale: "No high-risk negative movement was detected in the selected metrics.",
      action: "Continue monitoring revenue, renewals, payment failures, and download denials.",
      evidence: { revenue: metrics.revenue.total, paidOrders: metrics.orders.paid, activeLicenses: metrics.licenses.active },
      confidence: metrics.orders.total || metrics.licenses.total ? "medium" : "low",
    }));
  }

  return recommendations;
}

module.exports = { generate };
