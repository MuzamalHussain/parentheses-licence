process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15b_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15b_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15b_refresh_secret";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

const Cache = require("../src/services/performance/CacheManager");
const Policies = require("../src/services/performance/CachePolicyManager");
const Tags = require("../src/services/performance/CacheTagRegistry");
const Invalidation = require("../src/services/performance/CacheInvalidationService");
const Warmup = require("../src/services/performance/CacheWarmupService");
const Profiler = require("../src/services/performance/PerformanceProfiler");
const QueryOptimization = require("../src/services/performance/QueryOptimizationService");
const Performance = require("../src/services/performance/PerformanceOptimizationService");
const Metrics = require("../src/services/metricsService");

async function testCachePoliciesAndSlidingExpiration() {
  await Cache.clear();
  Policies.setPolicy("phase15b", { ttlSeconds: 30, slidingExpiration: true, tags: ["phase15b"], level: "memory" });
  await Cache.set("phase15b:key", { ok: true }, { policy: "phase15b" });
  assert.deepStrictEqual(await Cache.get("phase15b:key", { policy: "phase15b" }), { ok: true });
  assert.ok(Tags.keysFor(["phase15b"]).includes("phase15b:key"));
  const snapshot = Cache.snapshot();
  assert.ok(snapshot.levels.includes("redis"));
  assert.ok(snapshot.stats.hits >= 1);
}

async function testGroupedInvalidationAndWarmup() {
  await Cache.clear();
  await Cache.set("phase15b:license", { id: "lic_1" }, { policy: "licenses", tags: ["licenses"] });
  const invalidated = await Invalidation.invalidate({ group: "licenses", actor: { role: "admin" } });
  assert.ok(invalidated.tags.includes("licenses"));
  assert.strictEqual(await Cache.get("phase15b:license", { policy: "licenses" }), null);
  const warmed = await Warmup.warm(["dashboard", "products"]);
  assert.strictEqual(warmed.results.length, 2);
  assert.ok(Cache.snapshot().memoryKeys >= 2);
}

function testProfilerAndPayloadCapture() {
  Profiler.resetForTests();
  Profiler.recordApi({
    method: "GET",
    path: "/api/v1/admin/performance/dashboard",
    statusCode: 200,
    durationMs: 1000,
    responseBytes: 300000,
    requestId: "req_phase15b",
  });
  Profiler.recordDatabaseQuery({ model: "License", operation: "find", durationMs: 400 });
  Profiler.recordAiRequest({ provider: "test", model: "mock", durationMs: 12000 });
  Profiler.recordQueueJob({ queue: "reports", durationMs: 6000 });
  Profiler.recordWebhook({ endpoint: "test", durationMs: 4000 });
  const snapshot = Profiler.snapshot();
  assert.strictEqual(snapshot.slowApis.length, 1);
  assert.strictEqual(snapshot.largePayloads.length, 1);
  assert.strictEqual(snapshot.slowDatabaseQueries.length, 1);
  assert.strictEqual(snapshot.slowAiRequests.length, 1);
  assert.strictEqual(snapshot.slowQueueJobs.length, 1);
  assert.strictEqual(snapshot.slowWebhooks.length, 1);
}

function testQueryOptimizationFoundation() {
  const analysis = QueryOptimization.analyze();
  assert.strictEqual(analysis.slowQueryDetection, true);
  assert.ok(Array.isArray(analysis.missingIndexes));
  assert.ok(analysis.recommendations.length > 0);
}

async function testPerformanceDashboardAggregation() {
  Metrics.resetMetricsForTests();
  Metrics.recordHttpRequest({ method: "GET", path: "/api/test", statusCode: 200, durationMs: 100 });
  const dashboard = await Performance.dashboard();
  assert.ok(dashboard.cache);
  assert.ok(dashboard.profiler);
  assert.ok(dashboard.queries);
  assert.ok(dashboard.budgets);
  assert.ok(dashboard.assets.gzip);
  assert.ok(dashboard.recommendations.length > 0);
}

async function run() {
  await testCachePoliciesAndSlidingExpiration();
  await testGroupedInvalidationAndWarmup();
  testProfilerAndPayloadCapture();
  testQueryOptimizationFoundation();
  await testPerformanceDashboardAggregation();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15B performance optimization tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
