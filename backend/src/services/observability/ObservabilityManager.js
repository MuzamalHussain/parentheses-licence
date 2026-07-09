const Metrics = require("./MetricsCollector");
const Logs = require("./StructuredLogger");
const Traces = require("./TraceManager");
const Incidents = require("./IncidentManager");
const Alerts = require("./AlertManager");
const Slo = require("./SloService");
const Health = require("../infrastructure/HealthRegistry");

async function dashboard() {
  const [metrics, health, slo] = await Promise.all([
    Metrics.platformMetrics(),
    Health.snapshot(),
    Slo.snapshot(),
  ]);
  Alerts.evaluate(metrics);
  Incidents.detect({ metrics, health });
  return {
    generatedAt: new Date().toISOString(),
    health,
    metrics,
    logs: Logs.snapshot(),
    traces: Traces.snapshot(),
    alerts: Alerts.snapshot(),
    incidents: Incidents.snapshot(),
    slo,
    vendorNeutral: true,
  };
}

function recordStructuredLog(event, data = {}) {
  return Logs.write(event, data);
}

module.exports = { dashboard, recordStructuredLog };
