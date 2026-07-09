const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const License = require("../../models/License");
const Download = require("../../models/Download");
const Product = require("../../models/Product");
const PluginVersion = require("../../models/PluginVersion");
const OrganizationMembership = require("../../models/OrganizationMembership");

const PERIOD_DAYS = {
  today: 1,
  daily: 1,
  weekly: 7,
  "7d": 7,
  monthly: 30,
  "30d": 30,
  quarterly: 90,
  "90d": 90,
  yearly: 365,
  "1y": 365,
};

const PAID_ORDER_STATUSES = ["paid", "completed"];
const SUCCESS_PAYMENT_STATUSES = ["succeeded", "authorized"];

function parseTimeRange(params = {}) {
  const period = params.period || params.range || "30d";
  const end = params.end ? new Date(params.end) : new Date();
  let start;
  if (period === "custom") {
    start = params.start ? new Date(params.start) : new Date(end.getTime() - PERIOD_DAYS["30d"] * 86400000);
  } else if (period === "today" || period === "daily") {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else {
    const days = PERIOD_DAYS[period] || PERIOD_DAYS["30d"];
    start = new Date(end.getTime() - days * 86400000);
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Invalid AI business insight date range.");
  }
  const duration = Math.max(1, end.getTime() - start.getTime());
  return {
    period,
    start,
    end,
    comparisonStart: new Date(start.getTime() - duration),
    comparisonEnd: new Date(start.getTime()),
  };
}

function scopedFilter(organizationId, extra = {}) {
  return organizationId ? { organizationId, ...extra } : { ...extra };
}

function inRange(field, start, end) {
  return { [field]: { $gte: start, $lte: end } };
}

function percentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function sum(rows, getter) {
  return (rows || []).reduce((total, row) => total + Number(getter(row) || 0), 0);
}

function countBy(rows = [], field, defaults = {}) {
  return rows.reduce((out, row) => {
    const key = row[field] || "unknown";
    out[key] = (out[key] || 0) + 1;
    return out;
  }, { ...defaults });
}

function bucketByDate(rows = [], field = "createdAt", valueGetter = () => 1) {
  const buckets = new Map();
  for (const row of rows) {
    const date = row[field] ? new Date(row[field]) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + Number(valueGetter(row) || 0));
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function topRows(rows = [], field, limit = 5) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(row[field] || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, count]) => ({ key, count }));
}

async function fetchRows(organizationId, range) {
  const current = inRange("createdAt", range.start, range.end);
  const previous = inRange("createdAt", range.comparisonStart, range.comparisonEnd);
  const productFilter = scopedFilter(organizationId);
  const products = await Product.find(productFilter).select("_id name slug status").lean();
  const productIds = products.map((product) => product._id);
  const versionFilter = productIds.length ? { productId: { $in: productIds } } : { _id: { $in: [] } };

  const [
    orders,
    previousOrders,
    payments,
    previousPayments,
    licenses,
    previousLicenses,
    downloads,
    previousDownloads,
    memberships,
    previousMemberships,
    versions,
  ] = await Promise.all([
    Order.find(scopedFilter(organizationId, current)).select("status paymentStatus grandTotal amount currency productId userId createdAt").lean(),
    Order.find(scopedFilter(organizationId, previous)).select("status paymentStatus grandTotal amount currency productId userId createdAt").lean(),
    Payment.find(scopedFilter(organizationId, current)).select("status amount currency gateway createdAt").lean(),
    Payment.find(scopedFilter(organizationId, previous)).select("status amount currency gateway createdAt").lean(),
    License.find(scopedFilter(organizationId)).select("status licenseType createdAt renewal expiresAt productId activeDomains").lean(),
    License.find(scopedFilter(organizationId, previous)).select("status licenseType createdAt renewal expiresAt productId activeDomains").lean(),
    Download.find(scopedFilter(organizationId, current)).select("status productId pluginVersionId releaseChannel createdAt").lean(),
    Download.find(scopedFilter(organizationId, previous)).select("status productId pluginVersionId releaseChannel createdAt").lean(),
    OrganizationMembership.find(scopedFilter(organizationId, { status: "active", ...current })).select("userId role createdAt").lean(),
    OrganizationMembership.find(scopedFilter(organizationId, { status: "active", ...previous })).select("userId role createdAt").lean(),
    PluginVersion.find(versionFilter).select("productId versionNumber releaseChannel isLatest isPublished releasedAt createdAt").lean(),
  ]);
  return { products, versions, orders, previousOrders, payments, previousPayments, licenses, previousLicenses, downloads, previousDownloads, memberships, previousMemberships };
}

function buildMetrics(rows, range) {
  const paidOrders = rows.orders.filter((order) => PAID_ORDER_STATUSES.includes(order.status) || order.paymentStatus === "paid");
  const previousPaidOrders = rows.previousOrders.filter((order) => PAID_ORDER_STATUSES.includes(order.status) || order.paymentStatus === "paid");
  const successfulPayments = rows.payments.filter((payment) => SUCCESS_PAYMENT_STATUSES.includes(payment.status));
  const previousSuccessfulPayments = rows.previousPayments.filter((payment) => SUCCESS_PAYMENT_STATUSES.includes(payment.status));
  const revenue = sum(paidOrders, (order) => order.grandTotal || order.amount);
  const previousRevenue = sum(previousPaidOrders, (order) => order.grandTotal || order.amount);
  const paymentRevenue = sum(successfulPayments, (payment) => payment.amount);
  const activeLicenses = rows.licenses.filter((license) => license.status === "active" || license.status === "lifetime").length;
  const previousActiveLicenses = rows.previousLicenses.filter((license) => license.status === "active" || license.status === "lifetime").length;
  const renewals = rows.licenses.filter((license) => {
    const renewedAt = license.renewal?.lastRenewedAt ? new Date(license.renewal.lastRenewedAt) : null;
    return renewedAt && renewedAt >= range.start && renewedAt <= range.end;
  }).length;

  return {
    timeRange: range,
    modules: ["revenue", "orders", "payments", "licenses", "renewals", "downloads", "organizations", "customers", "products", "versions"],
    revenue: {
      total: revenue,
      previousTotal: previousRevenue,
      changePercent: percentChange(revenue, previousRevenue),
      paymentTotal: paymentRevenue,
      byDate: bucketByDate(paidOrders, "createdAt", (order) => order.grandTotal || order.amount),
    },
    orders: {
      total: rows.orders.length,
      paid: paidOrders.length,
      previousPaid: previousPaidOrders.length,
      statuses: countBy(rows.orders, "status", { draft: 0, pending: 0, processing: 0, completed: 0, paid: 0, cancelled: 0, failed: 0, refunded: 0 }),
      changePercent: percentChange(paidOrders.length, previousPaidOrders.length),
    },
    payments: {
      total: rows.payments.length,
      succeeded: successfulPayments.length,
      failed: rows.payments.filter((payment) => payment.status === "failed").length,
      refunded: rows.payments.filter((payment) => payment.status === "refunded" || payment.status === "partially_refunded").length,
      averageOrderValue: successfulPayments.length ? paymentRevenue / successfulPayments.length : 0,
      statuses: countBy(rows.payments, "status", { pending: 0, authorized: 0, succeeded: 0, failed: 0, cancelled: 0, refunded: 0, partially_refunded: 0 }),
    },
    licenses: {
      total: rows.licenses.length,
      active: activeLicenses,
      previousActive: previousActiveLicenses,
      statuses: countBy(rows.licenses, "status", { active: 0, expired: 0, suspended: 0, revoked: 0, lifetime: 0, trial: 0 }),
      changePercent: percentChange(activeLicenses, previousActiveLicenses),
    },
    renewals: {
      total: renewals,
      upcoming: rows.licenses.filter((license) => {
        const renewalAt = license.renewal?.nextRenewalAt ? new Date(license.renewal.nextRenewalAt) : license.expiresAt ? new Date(license.expiresAt) : null;
        return renewalAt && renewalAt >= range.end && renewalAt <= new Date(range.end.getTime() + 30 * 86400000);
      }).length,
    },
    downloads: {
      total: rows.downloads.length,
      previousTotal: rows.previousDownloads.length,
      completed: rows.downloads.filter((download) => download.status === "completed").length,
      denied: rows.downloads.filter((download) => download.status === "denied").length,
      byDate: bucketByDate(rows.downloads),
      topProducts: topRows(rows.downloads, "productId", 5),
      changePercent: percentChange(rows.downloads.length, rows.previousDownloads.length),
    },
    customers: {
      new: rows.memberships.length,
      previousNew: rows.previousMemberships.length,
      active: new Set(rows.orders.map((order) => String(order.userId))).size,
      changePercent: percentChange(rows.memberships.length, rows.previousMemberships.length),
    },
    products: {
      total: rows.products.length,
      active: rows.products.filter((product) => product.status === "active").length,
      topBySales: topRows(paidOrders, "productId", 5),
    },
    versions: {
      total: rows.versions.length,
      stable: rows.versions.filter((version) => version.releaseChannel === "stable").length,
      latest: rows.versions.filter((version) => version.isLatest).length,
    },
  };
}

async function analyze({ organizationId = null, period = "30d", range, start, end } = {}) {
  const timeRange = parseTimeRange({ period: range || period, start, end });
  const rows = await fetchRows(organizationId, timeRange);
  return buildMetrics(rows, timeRange);
}

module.exports = { analyze, parseTimeRange, percentChange };
