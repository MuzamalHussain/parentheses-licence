const Cache = require("./CacheManager");
const Invalidation = require("./CacheInvalidationService");
const Warmup = require("./CacheWarmupService");
const Profiler = require("./PerformanceProfiler");
const QueryOptimization = require("./QueryOptimizationService");
const Budgets = require("./PerformanceBudgetService");
const Capacity = require("../infrastructure/CapacityMetricsService");

function assetOptimization() {
  return {
    gzip: true,
    brotli: "foundation",
    compressionMiddleware: true,
    staticAssetVersioning: "frontend_build_hash_ready",
    cacheControlHeaders: "foundation",
  };
}

function recommendations({ cache, profiler, queries, budgets }) {
  const items = [];
  if (cache.stats.hitRatio < 0.5) items.push({ priority: "medium", area: "cache", message: "Warm dashboard, analytics, product, license, and settings caches before peak traffic." });
  if (profiler.slowApis.length) items.push({ priority: "high", area: "api", message: "Review slow API endpoints captured by the profiler." });
  if (queries.missingIndexes.some((idx) => !idx.present)) items.push({ priority: "medium", area: "database", message: "Review recommended compound indexes before high-volume production traffic." });
  if (budgets.status.apiResponse === "over_budget") items.push({ priority: "high", area: "budget", message: "Average API latency is above the configured budget." });
  if (!items.length) items.push({ priority: "low", area: "platform", message: "No active budget violations detected." });
  return items;
}

async function dashboard() {
  const [capacity] = await Promise.all([Capacity.snapshot()]);
  const cache = Cache.snapshot();
  const profiler = Profiler.snapshot();
  const queries = QueryOptimization.analyze();
  const budgets = Budgets.evaluate();
  return {
    generatedAt: new Date().toISOString(),
    cache,
    profiler,
    queries,
    budgets,
    capacity,
    assets: assetOptimization(),
    invalidationGroups: Invalidation.invalidationGroups(),
    warmupPlan: Warmup.plan(),
    recommendations: recommendations({ cache, profiler, queries, budgets }),
  };
}

module.exports = { dashboard };
