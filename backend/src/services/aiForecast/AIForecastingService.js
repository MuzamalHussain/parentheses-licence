const AIForecast = require("../../models/AIForecast");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const Trend = require("./AITrendForecastService");
const Renewal = require("./AIRenewalPredictionService");
const Churn = require("./AIChurnPredictionService");
const Capacity = require("./AICapacityForecastService");
const Formatter = require("./AIPredictionFormatter");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

function productForecast(signals, forecastWindowDays) {
  const downloads = Trend.forecastSeries(signals.series.downloads, forecastWindowDays);
  const orders = Trend.forecastSeries(signals.series.orders, forecastWindowDays);
  return {
    productGrowth: Math.round(orders.points.reduce((sum, point) => sum + point.value, 0)),
    productAdoption: Math.round(downloads.points.reduce((sum, point) => sum + point.value, 0)),
    downloadDemand: downloads,
    upgradeDemand: Math.round(downloads.baseline * forecastWindowDays * 0.35),
    confidenceScore: Math.round((downloads.confidenceScore + orders.confidenceScore) / 2),
  };
}

function supportForecast(signals, forecastWindowDays) {
  const tickets = Trend.forecastSeries(signals.series.tickets, forecastWindowDays);
  return {
    ticketVolume: Math.round(tickets.points.reduce((sum, point) => sum + point.value, 0)),
    supportWorkload: Math.round(tickets.baseline * 1.4 * forecastWindowDays),
    peakHours: ["10:00", "14:00"],
    peakDays: ["Monday", "Tuesday"],
    confidenceScore: tickets.confidenceScore,
  };
}

async function generate({ actor, organizationId, historicalWindowDays = 90, forecastWindowDays = 30 } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.forecast.read");
  const historyDays = Math.max(7, Math.min(Number(historicalWindowDays) || 90, 730));
  const futureDays = Math.max(7, Math.min(Number(forecastWindowDays) || 30, 365));
  const signals = await Trend.historicalSignals({ organizationId: orgId, historicalWindowDays: historyDays });
  const revenueForecast = Trend.revenueForecast(signals, futureDays);
  const licenseForecast = Renewal.predict(signals, futureDays);
  const churnAnalysis = Churn.churn(signals, licenseForecast);
  const products = productForecast(signals, futureDays);
  const support = supportForecast(signals, futureDays);
  const capacity = Capacity.forecast(signals, futureDays);
  const formatted = Formatter.format({
    signals,
    revenueForecast,
    licenseForecast,
    churnAnalysis,
    productForecast: products,
    supportForecast: support,
    capacityForecast: capacity,
    historicalWindowDays: historyDays,
    forecastWindowDays: futureDays,
  });
  const forecast = await AIForecast.create({
    organizationId: orgId,
    generatedBy: actor._id,
    forecastType: "executive",
    historicalWindowDays: historyDays,
    forecastWindowDays: futureDays,
    revenueForecast,
    licenseForecast,
    customerHealth: churnAnalysis.health,
    churnAnalysis,
    productForecast: products,
    supportForecast: support,
    capacityForecast: capacity,
    recommendations: formatted.recommendations,
    explainability: formatted.explainability,
    visualization: formatted.visualization,
    confidenceScore: formatted.confidenceScore,
  });
  await Audit.record("ai.forecast_generated", { actor, organizationId: orgId, targetId: forecast._id, ip: context.ip, requestId: context.requestId, metadata: { historicalWindowDays: historyDays, forecastWindowDays: futureDays } });
  if (formatted.recommendations.length) {
    await Audit.record("ai.forecast_recommendation_generated", { actor, organizationId: orgId, targetId: forecast._id, ip: context.ip, requestId: context.requestId, metadata: { count: formatted.recommendations.length } });
  }
  return { forecastId: forecast._id, revenueForecast, licenseForecast, customerHealth: churnAnalysis.health, churnAnalysis, productForecast: products, supportForecast: support, capacityForecast: capacity, ...formatted };
}

async function history({ actor, organizationId, limit = 20 } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.forecast.read");
  await Audit.record("ai.forecast_viewed", { actor, organizationId: orgId, metadata: { limit } });
  return AIForecast.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 20, 100)).lean();
}

module.exports = { generate, history, productForecast, supportForecast };
