function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function direction(change) {
  if (change > 0) return "increased";
  if (change < 0) return "decreased";
  return "held steady";
}

function confidence(metrics) {
  const signals = [
    metrics.orders.total,
    metrics.payments.total,
    metrics.licenses.total,
    metrics.downloads.total,
    metrics.products.total,
  ].filter((value) => Number(value || 0) > 0).length;
  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

function generate(metrics) {
  const confidenceLevel = confidence(metrics);
  return {
    revenueSummary: `Revenue was ${money(metrics.revenue.total)} and ${direction(metrics.revenue.changePercent)} by ${Math.abs(metrics.revenue.changePercent)}% versus the prior comparable period.`,
    growthSummary: `Paid orders ${direction(metrics.orders.changePercent)} by ${Math.abs(metrics.orders.changePercent)}%, while new customers ${direction(metrics.customers.changePercent)} by ${Math.abs(metrics.customers.changePercent)}%.`,
    customerSummary: `${metrics.customers.new} new organization members and ${metrics.customers.active} active ordering customers were observed in this period.`,
    licenseSummary: `${metrics.licenses.active} active or lifetime licenses are present across ${metrics.licenses.total} total licenses.`,
    downloadSummary: `${metrics.downloads.total} downloads were recorded, including ${metrics.downloads.completed} completed and ${metrics.downloads.denied} denied requests.`,
    platformHealthSummary: `${metrics.payments.failed} failed payments, ${metrics.licenses.statuses.suspended || 0} suspended licenses, and ${metrics.licenses.statuses.revoked || 0} revoked licenses require operational attention.`,
    confidenceLevel,
  };
}

module.exports = { generate };
