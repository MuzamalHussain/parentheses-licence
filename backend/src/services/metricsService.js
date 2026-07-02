const os = require("os");
const observabilityConfig = require("../config/observability");

const startedAt = Date.now();
let requestCount = 0;
let errorCount = 0;
let totalDurationMs = 0;
let maxDurationMs = 0;
let lastCpuUsage = process.cpuUsage();
let lastCpuAt = process.hrtime.bigint();
const routes = new Map();
const slowRequests = [];
const recentErrors = [];

function boundedPush(list, item, max) {
  list.push(item);
  while (list.length > max) list.shift();
}

function routeKey({ method = "UNKNOWN", path = "unknown", statusCode = 0 }) {
  const statusGroup = `${Math.floor(Number(statusCode || 0) / 100)}xx`;
  return `${method} ${path} ${statusGroup}`;
}

function recordHttpRequest({ method, path, statusCode, durationMs, requestId, userId }) {
  requestCount += 1;
  totalDurationMs += Number(durationMs || 0);
  maxDurationMs = Math.max(maxDurationMs, Number(durationMs || 0));

  const key = routeKey({ method, path, statusCode });
  const current = routes.get(key) || {
    method,
    path,
    statusGroup: `${Math.floor(Number(statusCode || 0) / 100)}xx`,
    count: 0,
    errors: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };
  current.count += 1;
  current.totalDurationMs += Number(durationMs || 0);
  current.maxDurationMs = Math.max(current.maxDurationMs, Number(durationMs || 0));
  if (Number(statusCode || 0) >= 500) current.errors += 1;
  routes.set(key, current);

  if (routes.size > observabilityConfig.metrics.maxRouteBuckets) {
    const oldest = routes.keys().next().value;
    routes.delete(oldest);
  }

  if (Number(statusCode || 0) >= 500) errorCount += 1;
  if (Number(durationMs || 0) >= observabilityConfig.logging.slowRequestMs) {
    boundedPush(slowRequests, {
      ts: new Date().toISOString(),
      method,
      path,
      statusCode,
      durationMs: Math.round(durationMs),
      requestId,
      userId: userId || null,
    }, observabilityConfig.metrics.maxSlowRequests);
  }
}

function recordError({ error, requestId, method, path, statusCode = 500, source = "app" }) {
  errorCount += 1;
  boundedPush(recentErrors, {
    ts: new Date().toISOString(),
    source,
    requestId,
    method,
    path,
    statusCode,
    name: error?.name || "Error",
    message: error?.message || String(error || "Unknown error"),
  }, observabilityConfig.metrics.maxRecentErrors);
}

function getCpuSample() {
  const now = process.hrtime.bigint();
  const usage = process.cpuUsage();
  const elapsedMicros = Number(now - lastCpuAt) / 1000;
  const usedMicros = (usage.user - lastCpuUsage.user) + (usage.system - lastCpuUsage.system);
  lastCpuAt = now;
  lastCpuUsage = usage;
  const cores = os.cpus()?.length || 1;
  return {
    percent: elapsedMicros > 0 ? Number(((usedMicros / elapsedMicros) * 100 / cores).toFixed(2)) : 0,
    cores,
  };
}

function getMetricsSnapshot() {
  const memory = process.memoryUsage();
  const routeStats = Array.from(routes.values()).map((route) => ({
    ...route,
    avgDurationMs: route.count ? Math.round(route.totalDurationMs / route.count) : 0,
  }));

  return {
    process: {
      uptimeSec: Math.round(process.uptime()),
      startedAt: new Date(startedAt).toISOString(),
      nodeVersion: process.version,
      pid: process.pid,
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      },
      cpu: getCpuSample(),
      loadAverage: os.loadavg(),
    },
    http: {
      requestCount,
      errorCount,
      avgDurationMs: requestCount ? Math.round(totalDurationMs / requestCount) : 0,
      maxDurationMs: Math.round(maxDurationMs),
      routes: routeStats,
      slowRequests: [...slowRequests],
    },
    errors: {
      count: errorCount,
      recent: [...recentErrors],
    },
  };
}

function resetMetricsForTests() {
  requestCount = 0;
  errorCount = 0;
  totalDurationMs = 0;
  maxDurationMs = 0;
  routes.clear();
  slowRequests.length = 0;
  recentErrors.length = 0;
}

module.exports = {
  recordHttpRequest,
  recordError,
  getMetricsSnapshot,
  resetMetricsForTests,
};
