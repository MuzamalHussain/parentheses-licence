const performanceConfig = require("../config/performance");
const observabilityConfig = require("../config/observability");
const { recordHttpRequest } = require("../services/metricsService");
const { logWarn } = require("../utils/logger");

function performanceLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

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
