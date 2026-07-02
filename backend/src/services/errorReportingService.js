const { recordError } = require("./metricsService");
const { sendAlert } = require("./alertService");
const { logError } = require("../utils/logger");

async function reportError(error, context = {}) {
  const statusCode = context.statusCode || error?.statusCode || 500;
  recordError({ error, ...context, statusCode });
  logError("error.reported", {
    requestId: context.requestId,
    source: context.source || "app",
    method: context.method,
    path: context.path,
    statusCode,
    error,
  });

  if (statusCode >= 500) {
    await sendAlert({
      severity: "critical",
      title: "Unexpected backend error",
      message: error?.message || "Unexpected backend error",
      metadata: {
        requestId: context.requestId,
        source: context.source || "app",
        method: context.method,
        path: context.path,
        statusCode,
      },
    });
  }
}

module.exports = { reportError };
