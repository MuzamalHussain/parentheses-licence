const performanceConfig = require("../config/performance");
const observabilityConfig = require("../config/observability");
const { recordHttpRequest } = require("../services/metricsService");
const Profiler = require("../services/performance/PerformanceProfiler");
const Observability = require("../services/observability/ObservabilityManager");
const MetricsCollector = require("../services/observability/MetricsCollector");
const { logWarn } = require("../utils/logger");

function performanceLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const requestBytes = Number(req.headers["content-length"] || 0);
  let responseBytes = 0;
  const write = res.write;
  const end = res.end;

  res.write = function writeWithMetrics(chunk, encoding, callback) {
    if (chunk) responseBytes += Buffer.byteLength(chunk, encoding);
    return write.call(this, chunk, encoding, callback);
  };

  res.end = function endWithMetrics(chunk, encoding, callback) {
    if (chunk) responseBytes += Buffer.byteLength(chunk, encoding);
    return end.call(this, chunk, encoding, callback);
  };

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const path = req.route?.path || req.originalUrl.split("?")[0];
    const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;
    recordHttpRequest({
      requestId: req.id,
      userId: req.user?._id,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs,
    });
    MetricsCollector.inc("api.requests", 1, { method: req.method, statusCode: res.statusCode });
    MetricsCollector.observe("api.response_time", durationMs, { method: req.method, endpoint: path });
    if (res.statusCode >= 400) MetricsCollector.inc("api.errors", 1, { method: req.method, statusCode: res.statusCode });
    Observability.recordStructuredLog("api.request", {
      severity: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId: req.id,
      traceId: req.traceId,
      userId: req.user?._id,
      organizationId: req.organization?._id || req.user?.organizationId,
      module: "api",
      endpoint: path,
      durationMs: Math.round(durationMs),
      statusCode: res.statusCode,
      metadata: { method: req.method, requestBytes, responseBytes },
    });
    Profiler.recordApi({
      requestId: req.id,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs,
      requestBytes,
      responseBytes,
    });
    if (
      durationMs >= performanceConfig.logging.slowRequestMs ||
      durationMs >= observabilityConfig.logging.slowRequestMs ||
      heapUsedMb >= performanceConfig.logging.memoryLogHeapMb ||
      heapUsedMb >= observabilityConfig.logging.memoryWarningHeapMb
    ) {
      logWarn("http.performance", {
        requestId: req.id,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs),
        heapUsedMb: Math.round(heapUsedMb),
      });
    }
  });

  next();
}

module.exports = { performanceLogger };
