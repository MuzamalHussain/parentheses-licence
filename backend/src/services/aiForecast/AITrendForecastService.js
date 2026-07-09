const Order = require("../../models/Order");
const License = require("../../models/License");
const Download = require("../../models/Download");
const SupportTicket = require("../../models/SupportTicket");
const AIUsageLog = require("../../models/AIUsageLog");

const paidStatuses = ["paid", "completed"];

function scoped(organizationId) {
  return organizationId ? { organizationId } : {};
}

function startDate(days) {
  return new Date(Date.now() - Number(days || 90) * 86400000);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function seriesFromRows(rows = [], valueField = "value") {
  const map = rows.reduce((out, row) => {
    const key = dayKey(row.createdAt);
    out[key] = (out[key] || 0) + Number(row[valueField] || 0);
    return out;
  }, {});
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function forecastSeries(series = [], forecastDays = 30) {
  const values = series.map((point) => Number(point.value || 0));
  const recent = values.slice(-14);
  const prior = values.slice(-28, -14);
  const baseline = average(recent.length ? recent : values);
  const priorAvg = average(prior);
  const dailyTrend = prior.length ? (baseline - priorAvg) / Math.max(1, recent.length) : 0;
  const points = [];
  for (let i = 1; i <= forecastDays; i += 1) {
    points.push({
      offsetDay: i,
      value: Math.max(0, Math.round((baseline + dailyTrend * i) * 100) / 100),
    });
  }
  const confidence = Math.max(25, Math.min(90, 35 + Math.min(series.length, 60) + (values.length >= 14 ? 10 : 0) - Math.abs(dailyTrend) * 5));
  return {
    baseline: Math.round(baseline * 100) / 100,
    dailyTrend: Math.round(dailyTrend * 100) / 100,
    points,
    confidenceScore: Math.round(confidence),
    observedDays: series.length,
  };
}

async function historicalSignals({ organizationId, historicalWindowDays = 90 } = {}) {
  const since = startDate(historicalWindowDays);
  const filter = scoped(organizationId);
  const [orders, licenses, downloads, tickets, aiUsage] = await Promise.all([
    Order.find({ ...filter, createdAt: { $gte: since }, status: { $in: paidStatuses } }).select("createdAt grandTotal amount currency userId productId").lean().catch(() => []),
    License.find({ ...filter }).select("createdAt expiresAt status renewal renewalHistory userId productId activeDomains").lean().catch(() => []),
    Download.find({ ...filter, createdAt: { $gte: since } }).select("createdAt productId status fileSizeBytes").lean().catch(() => []),
    SupportTicket.find({ ...filter, createdAt: { $gte: since } }).select("createdAt status category priority userId").lean().catch(() => []),
    AIUsageLog.find({ ...filter, createdAt: { $gte: since } }).select("createdAt totalTokens estimatedCost status").lean().catch(() => []),
  ]);
  return {
    orders,
    licenses,
    downloads,
    tickets,
    aiUsage,
    series: {
      revenue: seriesFromRows(orders.map((order) => ({ ...order, value: Number(order.grandTotal || order.amount || 0) }))),
      orders: seriesFromRows(orders.map((order) => ({ ...order, value: 1 }))),
      downloads: seriesFromRows(downloads.map((download) => ({ ...download, value: 1 }))),
      tickets: seriesFromRows(tickets.map((ticket) => ({ ...ticket, value: 1 }))),
      aiTokens: seriesFromRows(aiUsage.map((usage) => ({ ...usage, value: Number(usage.totalTokens || 0) }))),
    },
  };
}

function revenueForecast(signals, forecastWindowDays = 30) {
  const daily = forecastSeries(signals.series.revenue, forecastWindowDays);
  const total = daily.points.reduce((sum, point) => sum + point.value, 0);
  return {
    daily,
    weeklyRevenue: Math.round(daily.baseline * 7 * 100) / 100,
    monthlyRevenue: Math.round(daily.baseline * 30 * 100) / 100,
    quarterlyRevenue: Math.round(daily.baseline * 90 * 100) / 100,
    annualRevenue: Math.round(daily.baseline * 365 * 100) / 100,
    forecastWindowRevenue: Math.round(total * 100) / 100,
  };
}

module.exports = { historicalSignals, forecastSeries, revenueForecast, average };
