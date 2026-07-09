function recommendations({ revenueForecast, licenseForecast, churnAnalysis, capacityForecast }) {
  const output = [];
  if (licenseForecast.expirations > licenseForecast.renewals) {
    output.push({ type: "renewal_campaign", priority: "high", title: "Launch renewal outreach", reason: "Predicted expirations exceed renewals.", action: "Prioritize expiring licenses in the forecast window." });
  }
  if (churnAnalysis.cancellationRisk >= 50) {
    output.push({ type: "customer_outreach", priority: "high", title: "Review at-risk customers", reason: "Cancellation risk is elevated.", action: "Contact inactive customers and review support history." });
  }
  if (capacityForecast.apiTraffic.requests > 1000 || capacityForecast.aiTokenUsage.tokens > 50000) {
    output.push({ type: "infrastructure_scaling", priority: "medium", title: "Prepare capacity scaling", reason: "Forecasted traffic or AI token usage is growing.", action: "Review queue, API, and AI budget thresholds." });
  }
  if (revenueForecast.forecastWindowRevenue === 0) {
    output.push({ type: "revenue", priority: "medium", title: "Improve sales signal", reason: "No paid revenue was observed in the historical window.", action: "Review checkout funnel and product activation campaigns." });
  }
  return output;
}

function format({ signals, revenueForecast, licenseForecast, churnAnalysis, productForecast, supportForecast, capacityForecast, historicalWindowDays, forecastWindowDays }) {
  const confidenceScore = Math.round([
    revenueForecast.daily.confidenceScore,
    licenseForecast.confidenceScore,
    churnAnalysis.health.score,
    capacityForecast.confidenceScore,
  ].reduce((sum, value) => sum + Number(value || 0), 0) / 4);
  return {
    confidenceScore,
    recommendations: recommendations({ revenueForecast, licenseForecast, churnAnalysis, capacityForecast }),
    explainability: {
      historicalTimeWindow: `${historicalWindowDays} days`,
      forecastWindow: `${forecastWindowDays} days`,
      supportingMetrics: {
        orders: signals.orders.length,
        licenses: signals.licenses.length,
        downloads: signals.downloads.length,
        supportTickets: signals.tickets.length,
        aiUsageRows: signals.aiUsage.length,
      },
      predictionAssumptions: [
        "Uses moving averages and recent trend deltas over observed platform history.",
        "No external prediction APIs or custom trained models are used.",
        "Forecasts are advisory and should be reviewed against business context.",
      ],
      knownLimitations: [
        "Accuracy is lower when the historical window has sparse data.",
        "Seasonality is approximated by recent trend, not trained seasonal models.",
        "API traffic is estimated from available activity proxies until request telemetry is persisted.",
      ],
    },
    visualization: {
      revenueChart: revenueForecast.daily.points,
      renewalKpi: { renewals: licenseForecast.renewals, expirations: licenseForecast.expirations },
      customerHealth: churnAnalysis.health,
      capacityCards: capacityForecast,
      productTrend: productForecast,
      supportTrend: supportForecast,
    },
  };
}

module.exports = { format, recommendations };
