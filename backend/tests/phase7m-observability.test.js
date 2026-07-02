const assert = require("assert");
const http = require("http");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase7m";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase7m_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase7m_refresh_secret";
process.env.REDIS_ENABLED = "false";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function installModule(relativePath, exports) {
  const resolved = clearModule(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function request(server, { method = "GET", path: requestPath = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(body) : null;
    const req = http.request({
      port: server.address().port,
      method,
      path: requestPath,
      headers: {
        ...(payload ? { "Content-Length": payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testLoggerRedactsSecrets() {
  const { sanitizeLogData } = require(path.join(root, "src/utils/logger.js"));
  const sanitized = sanitizeLogData({
    password: "p@ss",
    nested: {
      authorization: "Bearer token",
      ok: "visible",
    },
    licenseKey: "LIC-123",
  });

  assert.strictEqual(sanitized.password, "[REDACTED]");
  assert.strictEqual(sanitized.nested.authorization, "[REDACTED]");
  assert.strictEqual(sanitized.nested.ok, "visible");
  assert.strictEqual(sanitized.licenseKey, "[REDACTED]");
}

async function testMetricsRecordRequestsAndErrors() {
  const metrics = require(path.join(root, "src/services/metricsService.js"));
  metrics.resetMetricsForTests();
  metrics.recordHttpRequest({
    method: "GET",
    path: "/health",
    statusCode: 200,
    durationMs: 12,
    requestId: "req-1",
  });
  metrics.recordError({
    error: new Error("boom"),
    requestId: "req-2",
    method: "GET",
    path: "/broken",
    statusCode: 500,
  });

  const snapshot = metrics.getMetricsSnapshot();
  assert.strictEqual(snapshot.http.requestCount, 1);
  assert.strictEqual(snapshot.errors.count, 1);
  assert.strictEqual(snapshot.errors.recent[0].message, "boom");
}

async function testDiagnosticsExposeDependencyStatus() {
  clearModule("src/services/diagnosticsService.js");
  const { getSystemDiagnostics } = require(path.join(root, "src/services/diagnosticsService.js"));
  const diagnostics = await getSystemDiagnostics();

  assert.strictEqual(diagnostics.success, true);
  assert.ok(diagnostics.checks.database);
  assert.ok(diagnostics.checks.storage);
  assert.ok(diagnostics.checks.smtp);
  assert.ok(diagnostics.checks.redis);
  assert.ok(diagnostics.checks.queue);
  assert.ok(diagnostics.checks.cache);
  assert.ok(diagnostics.metrics.process);
}

async function testHealthRoutesAndRequestIds() {
  installModule("src/utils/auditLog.js", { writeAuditLog: async () => {} });
  clearModule("src/app.js");
  const app = require(path.join(root, "src/app.js"));

  await withServer(app, async (server) => {
    const live = await request(server, { path: "/live", headers: { "x-request-id": "phase7m-live" } });
    assert.strictEqual(live.statusCode, 200);
    assert.strictEqual(live.headers["x-request-id"], "phase7m-live");
    assert.strictEqual(live.body.requestId, "phase7m-live");

    const health = await request(server, { path: "/health" });
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.success, true);
    assert.strictEqual(health.body.message, "API is running.");
    assert.ok(health.body.requestId);

    const ready = await request(server, { path: "/ready" });
    assert.ok([200, 503].includes(ready.statusCode));
    assert.ok(ready.body.checks.database);

    const metrics = await request(server, { path: "/metrics" });
    assert.ok([200, 503].includes(metrics.statusCode));
    assert.ok(metrics.body.metrics.http);
  });
}

async function testErrorHandlerReportsUnexpectedErrors() {
  let reported = null;
  installModule("src/services/errorReportingService.js", {
    reportError: async (err, context) => { reported = { err, context }; },
  });
  clearModule("src/utils/errorHandler.js");
  const { errorHandler } = require(path.join(root, "src/utils/errorHandler.js"));

  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  errorHandler(new Error("unexpected"), {
    id: "req-error",
    method: "GET",
    originalUrl: "/api/v1/broken",
  }, res, () => {});

  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.requestId, "req-error");
  assert.strictEqual(reported.context.requestId, "req-error");
}

async function run() {
  const tests = [
    testLoggerRedactsSecrets,
    testMetricsRecordRequestsAndErrors,
    testDiagnosticsExposeDependencyStatus,
    testHealthRoutesAndRequestIds,
    testErrorHandlerReportsUnexpectedErrors,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit(0));
