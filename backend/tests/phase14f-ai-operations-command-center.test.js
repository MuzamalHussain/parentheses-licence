const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14f_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14f_ai_secret_with_enough_entropy";

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

function doc(data) {
  return { ...data, toObject() { return { ...this }; }, async save() { return this; } };
}

function chain(value) {
  const api = {
    sort() { return api; },
    limit() { return api; },
    lean: async () => value,
    catch: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return api;
}

function sampleAggregate() {
  return {
    generatedAt: new Date("2026-07-09T00:00:00.000Z"),
    operations: {
      systemHealth: { status: "degraded", storage: { status: "ok" } },
      payments: { failedPayments: 3, webhooks: { failed: 1 } },
      queue: { failed: 2, running: 1 },
      email: { failed: 1, sent: 20 },
      api: { totalRequests: 100, averageResponseTime: 120 },
      database: { connectionStatus: "connected" },
      licenseServer: { validationRequests: 10, failedValidations: 1 },
    },
    aiProviders: {
      providers: [{ providerId: "openai", name: "OpenAI", status: "configured", health: { status: "healthy" } }],
      failures: 1,
      fallbackEvents: 2,
      totalTokens: 1234,
      estimatedCost: 12.5,
      averageLatencyMs: 250,
    },
    workflow: { pendingApprovals: 4, failedWorkflows: 2, runningWorkflows: 1, executionSuccessRate: 80 },
    security: { riskCounts: { low: 1, medium: 2, high: 3, critical: 1 }, highRiskAccounts: [], highRiskOrganizations: [] },
    business: { revenue: 2500, orders: 8, renewals: 2, downloads: 40, organizations: 1, customerGrowth: 3 },
  };
}

function loadCommandWithMocks() {
  const store = { snapshots: [], audits: [] };
  [
    "src/services/aiCommand/AIHealthSummaryService.js",
    "src/services/aiCommand/AIRecommendationCenter.js",
    "src/services/aiCommand/AIExecutiveBriefingService.js",
    "src/services/aiCommand/AICommandCenter.js",
    "src/services/aiCommand/AIOperationsAggregator.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIAuditService.js",
    "src/models/AICommandCenterSnapshot.js",
    "src/utils/ttlCache.js",
  ].forEach(clearModule);

  setMock("src/services/aiCommand/AIOperationsAggregator.js", { aggregate: async () => sampleAggregate() });
  setMock("src/services/ai/AIPermissionService.js", {
    assert: async (actor, organizationId, permission) => {
      if (actor?.role === "admin") return true;
      if (organizationId !== actor?.activeOrganizationId || permission !== "ai.operations.read") {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }
      return true;
    },
  });
  setMock("src/services/ai/AIAuditService.js", { record: async (action, entry) => store.audits.push({ action, entry }) });
  setMock("src/models/AICommandCenterSnapshot.js", { create: async (input) => { const row = doc({ _id: `snap_${store.snapshots.length + 1}`, ...input }); store.snapshots.push(row); return row; } });
  setMock("src/utils/ttlCache.js", { getCached: async (_key, _ttl, factory) => factory() });

  return {
    store,
    health: require(path.join(root, "src/services/aiCommand/AIHealthSummaryService.js")),
    recs: require(path.join(root, "src/services/aiCommand/AIRecommendationCenter.js")),
    briefing: require(path.join(root, "src/services/aiCommand/AIExecutiveBriefingService.js")),
    command: require(path.join(root, "src/services/aiCommand/AICommandCenter.js")),
  };
}

async function testHealthAggregationAndAlertPrioritization() {
  const { health } = loadCommandWithMocks();
  const summary = health.fromAggregates(sampleAggregate());
  assert.ok(summary.alerts.some((alert) => alert.level === "critical" && alert.source === "security"));
  assert.ok(summary.alerts.some((alert) => alert.source === "ai_workflows"));
  assert.strictEqual(summary.health.database.connectionStatus, "connected");
}

async function testRecommendationEngine() {
  const { health, recs } = loadCommandWithMocks();
  const aggregate = sampleAggregate();
  const summary = health.fromAggregates(aggregate);
  const recommendations = recs.generate(aggregate, summary.alerts);
  assert.strictEqual(recommendations[0].priority, "critical");
  assert.ok(recommendations.every((item) => item.automaticAction === false));
  assert.ok(recommendations.some((item) => item.businessImpact === "AI operating cost"));
}

async function testExecutiveBriefing() {
  const { health, recs, briefing } = loadCommandWithMocks();
  const aggregate = sampleAggregate();
  const summary = health.fromAggregates(aggregate);
  const recommendations = recs.generate(aggregate, summary.alerts);
  const brief = briefing.generate(aggregate, summary.alerts, recommendations);
  assert.ok(brief.dailySummary.includes("operational alerts"));
  assert.ok(brief.revenueSummary.includes("$2,500.00"));
  assert.ok(brief.aiUsageSummary.includes("1234"));
}

async function testCommandCenterDashboardAndNaturalLanguage() {
  const { command, store } = loadCommandWithMocks();
  const actor = { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" };
  const dashboard = await command.buildDashboard({ actor, organizationId: "org_1", force: true }, { ip: "127.0.0.1", requestId: "req_14f" });
  assert.ok(dashboard.briefing.dailySummary);
  assert.ok(dashboard.alerts.length > 0);
  assert.ok(store.audits.some((entry) => entry.action === "ai.command_center.health_scan_completed"));
  assert.ok(store.audits.some((entry) => entry.action === "ai.provider_failover"));

  const answer = await command.command({ actor, organizationId: "org_1", question: "What workflows are waiting?" }, { ip: "127.0.0.1" });
  assert.ok(answer.answer.includes("approvals"));
  assert.ok(store.snapshots.some((snapshot) => snapshot.question === "What workflows are waiting?"));
}

async function testPermissionIsolation() {
  const { command } = loadCommandWithMocks();
  await assert.rejects(
    () => command.buildDashboard({ actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_1" }, organizationId: "org_2", force: true }),
    (err) => err.statusCode === 403
  );
}

async function run() {
  const tests = [
    testHealthAggregationAndAlertPrioritization,
    testRecommendationEngine,
    testExecutiveBriefing,
    testCommandCenterDashboardAndNaturalLanguage,
    testPermissionIsolation,
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
