function metric(key, label, value, previousValue = 0, changePercent = 0) {
  return { key, label, value, previousValue, changePercent };
}

function supportingMetrics(metrics) {
  return [
    metric("revenue", "Revenue", metrics.revenue.total, metrics.revenue.previousTotal, metrics.revenue.changePercent),
    metric("paid_orders", "Paid Orders", metrics.orders.paid, metrics.orders.previousPaid, metrics.orders.changePercent),
    metric("new_customers", "New Customers", metrics.customers.new, metrics.customers.previousNew, metrics.customers.changePercent),
    metric("active_licenses", "Active Licenses", metrics.licenses.active, metrics.licenses.previousActive, metrics.licenses.changePercent),
    metric("downloads", "Downloads", metrics.downloads.total, metrics.downloads.previousTotal, metrics.downloads.changePercent),
    metric("failed_payments", "Failed Payments", metrics.payments.failed, 0, 0),
  ];
}

function visualization(metrics) {
  return {
    kpis: supportingMetrics(metrics).slice(0, 5),
    charts: [
      { key: "revenue_by_date", type: "line", title: "Revenue by Date", data: metrics.revenue.byDate },
      { key: "downloads_by_date", type: "line", title: "Downloads by Date", data: metrics.downloads.byDate },
    ],
    tables: [
      { key: "payment_statuses", title: "Payment Statuses", rows: Object.entries(metrics.payments.statuses).map(([status, count]) => ({ status, count })) },
      { key: "license_statuses", title: "License Statuses", rows: Object.entries(metrics.licenses.statuses).map(([status, count]) => ({ status, count })) },
    ],
  };
}

function limitations(metrics) {
  const out = [
    "Insights are descriptive and use stored platform records only.",
    "No predictive forecasting, fraud scoring, embeddings, or vector search is used.",
  ];
  if (!metrics.orders.total && !metrics.downloads.total) out.push("The selected range has sparse activity, so confidence is limited.");
  return out;
}

function dataSources() {
  return ["orders", "payments", "licenses", "downloads", "products", "versions", "organization_memberships"];
}

function format({ metrics, summary, recommendations, answer = "" }) {
  return {
    answer,
    summary,
    recommendations,
    supportingMetrics: supportingMetrics(metrics),
    timeRange: metrics.timeRange,
    dataSources: dataSources(),
    confidenceLevel: summary.confidenceLevel || "medium",
    knownLimitations: limitations(metrics),
    visualization: visualization(metrics),
  };
}

module.exports = { format, supportingMetrics, visualization, limitations, dataSources };
