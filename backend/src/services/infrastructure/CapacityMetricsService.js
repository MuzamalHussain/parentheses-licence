const os = require("os");
const { getMetricsSnapshot } = require("../metricsService");
const QueueArchitecture = require("./QueueArchitectureService");

async function snapshot() {
  const metrics = getMetricsSnapshot();
  const queue = await QueueArchitecture.status();
  const memory = process.memoryUsage();
  return {
    cpu: metrics.process.cpu,
    memory: {
      ...metrics.process.memory,
      externalMb: Math.round(memory.external / 1024 / 1024),
      freeSystemMb: Math.round(os.freemem() / 1024 / 1024),
      totalSystemMb: Math.round(os.totalmem() / 1024 / 1024),
    },
    queueDepth: {
      pending: queue.stats.pending || 0,
      running: queue.stats.running || 0,
      failed: queue.stats.failed || 0,
      retryQueue: queue.stats.retryQueue || 0,
    },
    requestThroughput: {
      totalRequests: metrics.http.requestCount,
      averageResponseTimeMs: metrics.http.avgDurationMs,
      maxResponseTimeMs: metrics.http.maxDurationMs,
      slowRequests: metrics.http.slowRequests.length,
    },
    concurrentSessions: {
      foundation: true,
      activeSessions: 0,
      note: "Session concurrency is ready for distributed tracking through Redis/session cache.",
    },
  };
}

module.exports = { snapshot };
