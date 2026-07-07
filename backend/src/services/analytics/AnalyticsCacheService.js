const { getCached } = require("../../utils/ttlCache");
const performanceConfig = require("../../config/performance");

function cacheKey(scope, filter = {}) {
  return `analytics:${scope}:${filter.period || "30d"}:${filter.start?.toISOString?.() || ""}:${filter.end?.toISOString?.() || ""}`;
}

async function cached(scope, filter, factory) {
  return getCached(cacheKey(scope, filter), performanceConfig.cache.dashboardTtlMs, factory);
}

module.exports = { cacheKey, cached };
