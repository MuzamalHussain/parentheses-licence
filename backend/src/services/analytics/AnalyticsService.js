const AnalyticsRepository = require("./AnalyticsRepository");
const Aggregator = require("./AnalyticsAggregator");
const Cache = require("./AnalyticsCacheService");

const PERIODS = {
  today: 0,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

function parseDateFilters(query = {}) {
  const period = query.period || "30d";
  const now = new Date();
  let start;
  let end = query.end ? new Date(query.end) : now;

  if (period === "custom") {
    start = query.start ? new Date(query.start) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Invalid custom analytics date range.");
  } else if (period === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = now;
  } else {
    const days = PERIODS[period] || PERIODS["30d"];
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  return { period, start, end };
}

async function executive(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("executive", filter, async () => {
    const raw = await AnalyticsRepository.fetchExecutive(filter);
    return Aggregator.executive(raw, filter);
  });
}

async function productAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("products", filter, async () => Aggregator.products(await AnalyticsRepository.fetchProductAnalytics(filter), filter));
}

async function versionAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("versions", filter, async () => Aggregator.versions(await AnalyticsRepository.fetchVersionAnalytics(filter), filter));
}

async function customerAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("customers", filter, async () => Aggregator.customers(await AnalyticsRepository.fetchCustomerAnalytics(filter), filter));
}

async function licenseAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("licenses", filter, async () => Aggregator.licenses(await AnalyticsRepository.fetchLicenseAnalytics(filter), filter));
}

async function paymentAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("payments", filter, async () => Aggregator.payments(await AnalyticsRepository.fetchPaymentAnalytics(filter), filter));
}

async function downloadAnalytics(query = {}) {
  const filter = parseDateFilters(query);
  return Cache.cached("downloads", filter, async () => Aggregator.downloads(await AnalyticsRepository.fetchDownloadAnalytics(filter), filter));
}

module.exports = {
  parseDateFilters,
  executive,
  productAnalytics,
  versionAnalytics,
  customerAnalytics,
  licenseAnalytics,
  paymentAnalytics,
  downloadAnalytics,
};
