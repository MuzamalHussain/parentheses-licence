const BaseMetrics = require("../metricsService");
const Cache = require("../performance/CacheManager");
const Queue = require("../infrastructure/QueueArchitectureService");
const Storage = require("../infrastructure/StorageProviderRegistry");
const AIProviderRegistry = require("../ai/AIProviderRegistry");

const counters = new Map();
const gauges = new Map();
const histograms = new Map();

function keyFor(name, labels = {}) {
  const serialized = Object.keys(labels).sort().map((key) => `${key}:${labels[key]}`).join(",");
  return serialized ? `${name}{${serialized}}` : name;
}

function inc(name, value = 1, labels = {}) {
  const key = keyFor(name, labels);
  counters.set(key, (counters.get(key) || 0) + Number(value || 0));
  return counters.get(key);
}

function gauge(name, value, labels = {}) {
  const key = keyFor(name, labels);
  gauges.set(key, Number(value || 0));
  return gauges.get(key);
}

function observe(name, value, labels = {}) {
  const key = keyFor(name, labels);
  const row = histograms.get(key) || { count: 0, total: 0, max: 0 };
  row.count += 1;
  row.total += Number(value || 0);
  row.max = Math.max(row.max, Number(value || 0));
  histograms.set(key, row);
  return row;
}

function compactMap(map) {
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

async function platformMetrics() {
  const base = BaseMetrics.getMetricsSnapshot();
  const queue = await Queue.status();
  const cache = Cache.snapshot();
  const storage = Storage.describe();
  const aiProviders = AIProviderRegistry.list ? AIProviderRegistry.list() : [];
  return {
    api: {
      requests: base.http.requestCount,
      averageResponseTimeMs: base.http.avgDurationMs,
      maxResponseTimeMs: base.http.maxDurationMs,
      errorRate: base.http.requestCount ? Number((base.http.errorCount / base.http.requestCount).toFixed(4)) : 0,
      routes: base.http.routes,
    },
    authentication: {
      attempts: counters.get("auth.attempts") || 0,
      failures: counters.get("auth.failures") || 0,
    },
    queue: {
      pending: queue.stats?.pending || 0,
      failed: queue.stats?.failed || 0,
      workers: queue.workers?.length || 0,
    },
    cache: {
      hitRatio: cache.stats.hitRatio,
      hits: cache.stats.hits,
      misses: cache.stats.misses,
      keys: cache.memoryKeys,
    },
    database: {
      queries: counters.get("database.queries") || 0,
      slowQueries: counters.get("database.slow_queries") || 0,
    },
    storage: {
      provider: storage.activeProvider,
      configuredProviders: storage.providers.filter((provider) => provider.configured).length,
    },
    ai: {
      providers: aiProviders.length,
      requests: counters.get("ai.requests") || 0,
      failures: counters.get("ai.failures") || 0,
    },
    webhooks: {
      delivered: counters.get("webhooks.delivered") || 0,
      failed: counters.get("webhooks.failed") || 0,
    },
  };
}

function snapshotRaw() {
  return {
    counters: compactMap(counters),
    gauges: compactMap(gauges),
    histograms: Array.from(histograms.entries()).map(([key, value]) => ({
      key,
      count: value.count,
      average: value.count ? Math.round(value.total / value.count) : 0,
      max: value.max,
    })),
  };
}

function resetForTests() {
  counters.clear();
  gauges.clear();
  histograms.clear();
}

module.exports = { gauge, inc, observe, platformMetrics, resetForTests, snapshotRaw };
