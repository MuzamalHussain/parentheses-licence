process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15c_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15c_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15c_refresh_secret";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

const Logs = require("../src/services/observability/StructuredLogger");
const Metrics = require("../src/services/observability/MetricsCollector");
const Traces = require("../src/services/observability/TraceManager");
const Incidents = require("../src/services/observability/IncidentManager");
const Alerts = require("../src/services/observability/AlertManager");
const Slo = require("../src/services/observability/SloService");
const Observability = require("../src/services/observability/ObservabilityManager");
const BaseMetrics = require("../src/services/metricsService");

function reset() {
  Logs.resetForTests();
  Metrics.resetForTests();
  Traces.resetForTests();
  Incidents.resetForTests();
  Alerts.resetForTests();
  BaseMetrics.resetMetricsForTests();
}

function testStructuredLoggingRedactionAndFiltering() {
  const entry = Logs.write("license.validation.failed", {
    severity: "warn",
    requestId: "req_15c",
    traceId: "trace_15c",
    userId: "user_1",
    organizationId: "org_1",
    module: "licensing",
    endpoint: "/api/v1/plugin/validate",
    durationMs: 42,
    statusCode: 403,
    metadata: { apiKey: "secret", nested: { password: "hidden" } },
  });
  assert.strictEqual(entry.metadata.apiKey, "[REDACTED]");
  assert.strictEqual(entry.metadata.nested.password, "[REDACTED]");
  assert.strictEqual(Logs.query({ module: "licensing" }).length, 1);
  assert.strictEqual(Logs.query({ organizationId: "org_1" }).length, 1);
}

async function testMetricsAndSlo() {
  BaseMetrics.recordHttpRequest({ method: "GET", path: "/api/v1/products", statusCode: 200, durationMs: 50 });
  BaseMetrics.recordHttpRequest({ method: "GET", path: "/api/v1/products", statusCode: 500, durationMs: 150 });
  Metrics.inc("auth.attempts");
  Metrics.inc("auth.failures");
  Metrics.inc("ai.requests");
  Metrics.inc("webhooks.failed");
  Metrics.observe("database.query", 300, { model: "License" });
  const metrics = await Metrics.platformMetrics();
  assert.strictEqual(metrics.api.requests, 2);
  assert.ok(metrics.api.errorRate > 0);
  assert.strictEqual(metrics.authentication.failures, 1);
  assert.strictEqual(metrics.ai.requests, 1);
  const slo = await Slo.snapshot();
  assert.ok(slo.successRate < 1);
  assert.ok(slo.errorBudget);
}

function testTracing() {
  const traceId = Traces.createTrace({ requestId: "req_trace", module: "downloads", endpoint: "/api/v1/downloads/latest" });
  const spanId = Traces.startSpan(traceId, "download.authorize", { productId: "prod_1" });
  Traces.endSpan(traceId, spanId, "ok");
  Traces.endTrace(traceId, "ok");
  const trace = Traces.query({ traceId })[0];
  assert.strictEqual(trace.traceId, traceId);
  assert.strictEqual(trace.spans.length, 1);
  assert.strictEqual(trace.status, "ok");
}

function testAlertsAndIncidents() {
  const alerts = Alerts.evaluate({
    api: { errorRate: 0.25, averageResponseTimeMs: 1200 },
    queue: { failed: 2 },
    cache: { hitRatio: 0.1 },
  });
  assert.ok(alerts.length >= 3);
  const alert = alerts[0];
  assert.strictEqual(Alerts.acknowledge(alert.id).status, "acknowledged");

  const incident = Incidents.create({ title: "API degraded", severity: "high", affectedServices: ["api"] });
  assert.strictEqual(incident.status, "open");
  assert.strictEqual(Incidents.resolve(incident.id, { notes: "Recovered" }).status, "resolved");
}

async function testDashboardAggregation() {
  const dashboard = await Observability.dashboard();
  assert.ok(dashboard.metrics);
  assert.ok(dashboard.logs);
  assert.ok(dashboard.traces);
  assert.ok(dashboard.alerts);
  assert.ok(dashboard.incidents);
  assert.ok(dashboard.slo);
  assert.strictEqual(dashboard.vendorNeutral, true);
}

async function run() {
  reset();
  testStructuredLoggingRedactionAndFiltering();
  await testMetricsAndSlo();
  testTracing();
  testAlertsAndIncidents();
  await testDashboardAggregation();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15C observability monitoring incident response tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
