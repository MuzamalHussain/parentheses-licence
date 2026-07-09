const Metrics = require("./MetricsCollector");

async function snapshot() {
  const metrics = await Metrics.platformMetrics();
  const successRate = metrics.api.requests
    ? Number((1 - metrics.api.errorRate).toFixed(4))
    : 1;
  const latencyTargetMs = 750;
  const latencyHealthy = metrics.api.averageResponseTimeMs <= latencyTargetMs;
  const availability = successRate;
  return {
    availability,
    uptime: availability,
    latency: {
      targetMs: latencyTargetMs,
      currentMs: metrics.api.averageResponseTimeMs,
      status: latencyHealthy ? "within_slo" : "breached",
    },
    errorBudget: {
      targetSuccessRate: 0.995,
      currentSuccessRate: successRate,
      remaining: Number(Math.max(0, successRate - 0.995).toFixed(4)),
    },
    successRate,
  };
}

module.exports = { snapshot };
