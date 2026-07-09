const performanceConfig = require("../../config/performance");
const Profiler = require("./PerformanceProfiler");
const Metrics = require("../metricsService");

function evaluate() {
  const metrics = Metrics.getMetricsSnapshot();
  const profiler = Profiler.snapshot();
  const budgets = performanceConfig.budgets || {};
  return {
    targets: budgets,
    status: {
      apiResponse: metrics.http.avgDurationMs <= (budgets.apiResponseMs || 750) ? "within_budget" : "over_budget",
      dashboardLoad: "foundation",
      search: "foundation",
      downloads: "foundation",
      queueProcessing: profiler.slowQueueJobs.length ? "watch" : "within_budget",
    },
    evidence: {
      averageApiResponseMs: metrics.http.avgDurationMs,
      maxApiResponseMs: metrics.http.maxDurationMs,
      slowApis: profiler.slowApis.length,
      slowQueueJobs: profiler.slowQueueJobs.length,
      slowAiRequests: profiler.slowAiRequests.length,
      slowWebhooks: profiler.slowWebhooks.length,
    },
  };
}

module.exports = { evaluate };
