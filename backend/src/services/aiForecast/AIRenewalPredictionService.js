function inWindow(date, days) {
  if (!date) return false;
  const value = new Date(date).getTime();
  return value >= Date.now() && value <= Date.now() + Number(days || 30) * 86400000;
}

function predict(signals, forecastWindowDays = 30) {
  const licenses = signals.licenses || [];
  const expiring = licenses.filter((license) => inWindow(license.expiresAt || license.renewal?.nextRenewalAt || license.subscription?.renewalDate, forecastWindowDays));
  const renewed = licenses.filter((license) => (license.renewalHistory || []).length > 0).length;
  const renewable = licenses.filter((license) => ["active", "trial"].includes(license.status) && license.expiresAt).length;
  const historicalRenewalRate = renewable ? renewed / renewable : 0;
  const predictedRenewals = Math.round(expiring.length * Math.max(0.15, Math.min(0.95, historicalRenewalRate || 0.5)));
  const expirations = Math.max(0, expiring.length - predictedRenewals);
  const activeDomains = licenses.reduce((sum, license) => sum + (license.activeDomains || []).length, 0);
  return {
    renewals: predictedRenewals,
    expirations,
    activationDemand: Math.round(activeDomains * 0.08 + expiring.length * 0.25),
    licenseGrowth: Math.round((signals.series.orders?.slice(-30).reduce((sum, point) => sum + point.value, 0) || 0) * 0.85),
    historicalRenewalRate: Math.round(historicalRenewalRate * 10000) / 100,
    supportingMetrics: {
      licenses: licenses.length,
      renewable,
      expiringInWindow: expiring.length,
      historicalRenewals: renewed,
      activeDomains,
    },
    confidenceScore: Math.max(30, Math.min(88, 45 + Math.min(renewable, 30) + (renewed > 0 ? 10 : 0))),
  };
}

module.exports = { predict };
