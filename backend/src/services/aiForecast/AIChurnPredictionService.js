function uniqueCount(rows = [], key) {
  return new Set(rows.map((row) => String(row[key] || "")).filter(Boolean)).size;
}

function healthCategory(score) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 35) return "warning";
  return "critical";
}

function customerHealth(signals) {
  const activeCustomers = uniqueCount(signals.orders, "userId") + uniqueCount(signals.downloads, "userId");
  const licenseUsers = uniqueCount(signals.licenses, "userId");
  const ticketPressure = signals.tickets.length;
  const paymentActivity = signals.orders.length;
  const downloadActivity = signals.downloads.length;
  const renewalActivity = signals.licenses.filter((license) => (license.renewalHistory || []).length > 0).length;
  const score = Math.max(0, Math.min(100,
    45
    + Math.min(20, paymentActivity * 2)
    + Math.min(15, downloadActivity)
    + Math.min(10, renewalActivity * 3)
    + Math.min(10, activeCustomers + licenseUsers)
    - Math.min(30, ticketPressure * 2)
  ));
  return {
    score,
    category: healthCategory(score),
    supportingMetrics: {
      activeCustomers,
      licensedCustomers: licenseUsers,
      downloads: downloadActivity,
      paidOrders: paymentActivity,
      renewals: renewalActivity,
      supportTickets: ticketPressure,
    },
  };
}

function churn(signals, renewalForecast) {
  const health = customerHealth(signals);
  const dormantOrganizations = health.supportingMetrics.activeCustomers === 0 && health.supportingMetrics.licensedCustomers > 0 ? 1 : 0;
  const inactiveCustomers = Math.max(0, health.supportingMetrics.licensedCustomers - health.supportingMetrics.activeCustomers);
  const renewalProbability = Math.max(5, Math.min(95, renewalForecast.historicalRenewalRate || (health.score * 0.8)));
  const cancellationRisk = Math.max(0, Math.min(95, 100 - health.score + renewalForecast.expirations * 2));
  return {
    renewalProbability: Math.round(renewalProbability * 100) / 100,
    cancellationRisk: Math.round(cancellationRisk * 100) / 100,
    inactiveCustomers,
    dormantOrganizations,
    health,
  };
}

module.exports = { customerHealth, churn, healthCategory };
