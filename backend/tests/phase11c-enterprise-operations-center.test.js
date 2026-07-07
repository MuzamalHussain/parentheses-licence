const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase11c_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase11c_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function setMock(relativePath, exports) {
  const resolved = clearModule(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function makeModel({ count = 0, aggregateRows = [], findOne = null, findOneAndUpdate = null } = {}) {
  return {
    countDocuments: async () => count,
    aggregate: async () => aggregateRows,
    findOne: () => ({ lean: async () => findOne }),
    findOneAndUpdate: async (...args) => (findOneAndUpdate ? findOneAndUpdate(...args) : null),
  };
}

function loadOperationsWithMocks() {
  const store = {
    audits: [],
    cleared: [],
    state: null,
    jobsProcessed: false,
  };

  [
    "src/services/operations/HealthAggregator.js",
    "src/services/operations/OperationsService.js",
    "src/models/OperationsState.js",
    "src/models/AuditLog.js",
    "src/models/Download.js",
    "src/models/LicenseActivation.js",
    "src/models/LicenseSite.js",
    "src/models/Payment.js",
    "src/models/WebhookEvent.js",
    "src/services/workflows/WorkflowEngine.js",
    "src/services/diagnosticsService.js",
    "src/services/metricsService.js",
    "src/services/paymentProviderStatus.js",
    "src/utils/ttlCache.js",
    "src/utils/auditLog.js",
  ].forEach(clearModule);

  setMock("src/models/AuditLog.js", makeModel({
    aggregateRows: [
      { _id: "notification.sent", count: 9 },
      { _id: "notification.failed", count: 2 },
      { _id: "notification.retried", count: 3 },
    ],
    count: 4,
  }));
  setMock("src/models/Download.js", makeModel());
  setMock("src/models/LicenseActivation.js", makeModel({ count: 5 }));
  setMock("src/models/LicenseSite.js", makeModel({ count: 7 }));
  setMock("src/models/Payment.js", makeModel({
    aggregateRows: [
      { _id: "failed", count: 2 },
      { _id: "refunded", count: 1 },
    ],
  }));
  setMock("src/models/WebhookEvent.js", makeModel({
    aggregateRows: [
      { _id: "processing", count: 3 },
      { _id: "failed", count: 1 },
    ],
  }));
  setMock("src/models/OperationsState.js", {
    findOne: () => ({ lean: async () => store.state }),
    findOneAndUpdate: (_filter, update) => ({
      lean: async () => {
        store.state = { key: "global", ...store.state, ...(update.$set || {}) };
        return store.state;
      },
    }),
  });
  setMock("src/services/workflows/WorkflowEngine.js", {
    stats: async () => ({ pending: 1, queued: 1, running: 2, completed: 10, failed: 1, retryQueue: 3, retrying: 3, cancelled: 0 }),
    processDueJobs: async () => {
      store.jobsProcessed = true;
      return { success: true, processed: 2 };
    },
  });
  setMock("src/services/diagnosticsService.js", {
    getSystemDiagnostics: async () => ({
      status: "ok",
      checks: {
        database: { status: "ok", ok: true, state: "connected" },
        storage: { status: "ok", ok: true, provider: "local" },
        smtp: { status: "ok", ok: true, enabled: true },
        operations: { environment: { ok: true } },
      },
    }),
  });
  setMock("src/services/metricsService.js", {
    getMetricsSnapshot: () => ({
      http: {
        requestCount: 20,
        errorCount: 1,
        avgDurationMs: 42,
        maxDurationMs: 140,
        routes: [{ method: "GET", path: "/api/v1/test", statusGroup: "2xx", count: 2, avgDurationMs: 60 }],
      },
      errors: {
        count: 1,
        recent: [{ ts: new Date().toISOString(), source: "test", requestId: "req_1", statusCode: 500, message: "boom" }],
      },
    }),
  });
  setMock("src/services/paymentProviderStatus.js", {
    getPaymentProviderStatuses: () => [{ id: "stripe", name: "Stripe", enabled: true, operational: true }],
  });
  setMock("src/utils/ttlCache.js", {
    getCached: async (_key, _ttl, factory) => factory(),
    clearCache: (prefix = "") => store.cleared.push(prefix),
  });
  setMock("src/utils/auditLog.js", {
    writeAuditLog: async (entry) => store.audits.push(entry),
  });

  return {
    store,
    HealthAggregator: require(path.join(root, "src/services/operations/HealthAggregator.js")),
    OperationsService: require(path.join(root, "src/services/operations/OperationsService.js")),
  };
}

async function testHealthChecksAndDashboardAggregation() {
  const { OperationsService } = loadOperationsWithMocks();
  const dashboard = await OperationsService.getDashboard({ force: true });
  assert.strictEqual(dashboard.systemHealth.status, "ok");
  assert.strictEqual(dashboard.queue.pending, 1);
  assert.strictEqual(dashboard.email.sent, 9);
  assert.strictEqual(dashboard.payments.webhookQueue, 3);
  assert.strictEqual(dashboard.licenseServer.activationRequests, 5);
  assert.strictEqual(dashboard.api.totalRequests, 20);
  assert.strictEqual(dashboard.errors[0].severity, "critical");
}

async function testMaintenanceActionsAreAudited() {
  const { OperationsService, store } = loadOperationsWithMocks();
  await OperationsService.runMaintenanceAction({
    action: "set-maintenance",
    body: { maintenanceMode: true, readOnlyMode: true },
    actor: { _id: "admin_1", role: "admin", email: "ops@example.test" },
    ip: "127.0.0.1",
    requestId: "req_ops",
  });
  assert.strictEqual(store.state.maintenanceMode, true);
  assert.strictEqual(store.state.readOnlyMode, true);
  assert.ok(store.cleared.includes("operations:"));
  assert.ok(store.audits.some((entry) => entry.action === "operations.maintenance_updated"));
}

async function testCacheClearAndRestartJobs() {
  const { OperationsService, store } = loadOperationsWithMocks();
  await OperationsService.runMaintenanceAction({ action: "clear-cache", actor: { role: "admin" } });
  const restart = await OperationsService.runMaintenanceAction({ action: "restart-jobs", actor: { role: "admin" } });
  assert.ok(store.cleared.includes(""));
  assert.strictEqual(store.jobsProcessed, true);
  assert.strictEqual(restart.processed, 2);
  assert.ok(store.audits.some((entry) => entry.action === "operations.jobs_restarted"));
}

function testPermissions() {
  const { requireSuperAdmin, isSuperAdmin } = require(path.join(root, "src/middleware/operationsAuth.js"));
  assert.strictEqual(isSuperAdmin({ role: "admin" }), true);
  assert.strictEqual(isSuperAdmin({ role: "support" }), false);
  let error = null;
  requireSuperAdmin({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function testErrorCenterFoundation() {
  const { HealthAggregator } = loadOperationsWithMocks();
  const errors = HealthAggregator.getErrorCenter();
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].source, "test");
  assert.strictEqual(errors[0].resolutionStatus, "open");
}

async function run() {
  const tests = [
    testHealthChecksAndDashboardAggregation,
    testMaintenanceActionsAreAudited,
    testCacheClearAndRestartJobs,
    testPermissions,
    testErrorCenterFoundation,
  ];
  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
