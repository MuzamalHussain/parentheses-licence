const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14c_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14c_ai_secret_with_enough_entropy";

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

function getValue(row, key) {
  return key.split(".").reduce((value, part) => value?.[part], row);
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    const actual = getValue(row, key);
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(actual));
    if (value && typeof value === "object" && "$gte" in value) {
      const date = new Date(actual);
      return date >= value.$gte && date <= value.$lte;
    }
    if (key === "_id") return String(row._id) === String(value);
    return value === undefined || String(actual) === String(value);
  });
}

function chain(value) {
  const api = {
    select() { return api; },
    sort() { return api; },
    limit() { return api; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return api;
}

function model(list, prefix) {
  function Model(input) {
    const row = doc({ _id: `${prefix}_${list.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input });
    row.save = async function save() {
      const existing = list.find((item) => item._id === this._id);
      if (!existing) list.push(this);
      return this;
    };
    return row;
  }
  Model.find = (filter = {}) => chain(list.filter((row) => matches(row, filter)));
  Model.findOne = (filter = {}) => chain(list.find((row) => matches(row, filter)) || null);
  Model.create = async (input) => {
    const row = Model(input);
    list.push(row);
    return row;
  };
  return Model;
}

function loadBusinessWithMocks() {
  const now = new Date("2026-07-08T12:00:00.000Z");
  const store = {
    products: [
      doc({ _id: "prod_1", organizationId: "org_1", name: "Plugin Pro", status: "active" }),
      doc({ _id: "prod_2", organizationId: "org_2", name: "Other Plugin", status: "active" }),
    ],
    versions: [
      doc({ _id: "ver_1", productId: "prod_1", versionNumber: "2.1.0", releaseChannel: "stable", isLatest: true, isPublished: true }),
      doc({ _id: "ver_2", productId: "prod_2", versionNumber: "1.0.0", releaseChannel: "stable", isLatest: true, isPublished: true }),
    ],
    orders: [
      doc({ _id: "ord_1", organizationId: "org_1", userId: "user_1", productId: "prod_1", status: "completed", paymentStatus: "paid", grandTotal: 120, currency: "USD", createdAt: new Date("2026-07-07T10:00:00.000Z") }),
      doc({ _id: "ord_2", organizationId: "org_1", userId: "user_2", productId: "prod_1", status: "failed", paymentStatus: "failed", grandTotal: 80, currency: "USD", createdAt: new Date("2026-07-06T10:00:00.000Z") }),
      doc({ _id: "ord_3", organizationId: "org_1", userId: "user_3", productId: "prod_1", status: "completed", paymentStatus: "paid", grandTotal: 60, currency: "USD", createdAt: new Date("2026-06-01T10:00:00.000Z") }),
      doc({ _id: "ord_4", organizationId: "org_2", userId: "user_4", productId: "prod_2", status: "completed", paymentStatus: "paid", grandTotal: 999, currency: "USD", createdAt: new Date("2026-07-07T10:00:00.000Z") }),
    ],
    payments: [
      doc({ _id: "pay_1", organizationId: "org_1", status: "succeeded", amount: 120, currency: "USD", createdAt: new Date("2026-07-07T10:00:00.000Z") }),
      doc({ _id: "pay_2", organizationId: "org_1", status: "failed", amount: 80, currency: "USD", createdAt: new Date("2026-07-06T10:00:00.000Z") }),
    ],
    licenses: [
      doc({ _id: "lic_1", organizationId: "org_1", productId: "prod_1", status: "active", licenseType: "single_site", createdAt: new Date("2026-07-01T00:00:00.000Z"), renewal: { nextRenewalAt: new Date("2026-07-20T00:00:00.000Z"), lastRenewedAt: new Date("2026-07-02T00:00:00.000Z") }, activeDomains: [{ domain: "example.com" }] }),
      doc({ _id: "lic_2", organizationId: "org_1", productId: "prod_1", status: "expired", licenseType: "single_site", createdAt: new Date("2026-06-01T00:00:00.000Z"), renewal: {}, expiresAt: new Date("2026-06-30T00:00:00.000Z") }),
      doc({ _id: "lic_3", organizationId: "org_2", productId: "prod_2", status: "active", licenseType: "agency", createdAt: now }),
    ],
    downloads: [
      doc({ _id: "down_1", organizationId: "org_1", productId: "prod_1", pluginVersionId: "ver_1", status: "completed", createdAt: new Date("2026-07-07T10:00:00.000Z") }),
      doc({ _id: "down_2", organizationId: "org_1", productId: "prod_1", pluginVersionId: "ver_1", status: "denied", createdAt: new Date("2026-07-06T10:00:00.000Z") }),
    ],
    memberships: [
      doc({ _id: "mem_1", organizationId: "org_1", userId: "user_1", status: "active", role: "owner", createdAt: new Date("2026-07-07T10:00:00.000Z") }),
    ],
    insights: [],
    usage: [],
    audits: [],
  };

  [
    "src/services/aiBusiness/AITrendAnalyzer.js",
    "src/services/aiBusiness/AIExecutiveSummaryService.js",
    "src/services/aiBusiness/AIRecommendationEngine.js",
    "src/services/aiBusiness/AIInsightFormatter.js",
    "src/services/aiBusiness/AIBusinessInsightService.js",
    "src/services/ai/AIRequestService.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIAuditService.js",
    "src/services/ai/AITokenTracker.js",
    "src/services/ai/AICostTracker.js",
    "src/models/AIBusinessInsight.js",
    "src/models/Product.js",
    "src/models/PluginVersion.js",
    "src/models/Order.js",
    "src/models/Payment.js",
    "src/models/License.js",
    "src/models/Download.js",
    "src/models/OrganizationMembership.js",
    "src/models/AIProviderConfig.js",
    "src/models/AIModel.js",
    "src/models/AIUsageLog.js",
    "src/utils/auditLog.js",
  ].forEach(clearModule);

  setMock("src/models/AIBusinessInsight.js", model(store.insights, "insight"));
  setMock("src/models/Product.js", model(store.products, "product"));
  setMock("src/models/PluginVersion.js", model(store.versions, "version"));
  setMock("src/models/Order.js", model(store.orders, "order"));
  setMock("src/models/Payment.js", model(store.payments, "payment"));
  setMock("src/models/License.js", model(store.licenses, "license"));
  setMock("src/models/Download.js", model(store.downloads, "download"));
  setMock("src/models/OrganizationMembership.js", model(store.memberships, "membership"));
  setMock("src/models/AIProviderConfig.js", { findOne: () => chain(null) });
  setMock("src/models/AIModel.js", { findOne: () => chain(null) });
  setMock("src/models/AIUsageLog.js", { create: async (input) => { const row = doc({ _id: `usage_${store.usage.length + 1}`, ...input }); store.usage.push(row); return row; } });
  setMock("src/services/ai/AIPermissionService.js", {
    assert: async (actor, organizationId, permission) => {
      if (actor?.role === "admin") return true;
      if (organizationId !== actor?.activeOrganizationId || permission !== "ai.analytics.read") {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }
      return true;
    },
  });
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    analyzer: require(path.join(root, "src/services/aiBusiness/AITrendAnalyzer.js")),
    recommender: require(path.join(root, "src/services/aiBusiness/AIRecommendationEngine.js")),
    service: require(path.join(root, "src/services/aiBusiness/AIBusinessInsightService.js")),
  };
}

async function testTrendAnalysisAndTenantScope() {
  const { analyzer } = loadBusinessWithMocks();
  const metrics = await analyzer.analyze({ organizationId: "org_1", period: "30d", end: "2026-07-08T12:00:00.000Z" });
  assert.strictEqual(metrics.revenue.total, 120);
  assert.strictEqual(metrics.orders.paid, 1);
  assert.strictEqual(metrics.payments.failed, 1);
  assert.strictEqual(metrics.licenses.active, 1);
  assert.strictEqual(metrics.downloads.total, 2);
  assert.strictEqual(metrics.products.total, 1);
}

async function testRecommendationRules() {
  const { analyzer, recommender } = loadBusinessWithMocks();
  const metrics = await analyzer.analyze({ organizationId: "org_1", period: "30d", end: "2026-07-08T12:00:00.000Z" });
  const recommendations = recommender.generate(metrics);
  assert.ok(recommendations.some((item) => item.key === "payment_recovery"));
  assert.ok(recommendations.some((item) => item.key === "renewal_improvements"));
  assert.ok(recommendations.some((item) => item.key === "activation_optimization"));
}

async function testInsightGenerationAndAuditLogging() {
  const { service, store } = loadBusinessWithMocks();
  const result = await service.dashboard({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1", period: "30d", end: "2026-07-08T12:00:00.000Z" }, { ip: "127.0.0.1", requestId: "req_1" });
  assert.ok(result.summary.revenueSummary.includes("$120.00"));
  assert.strictEqual(store.insights.length, 1);
  assert.ok(store.audits.some((entry) => entry.action === "ai.insight_generated"));
  assert.ok(result.knownLimitations.some((item) => item.toLowerCase().includes("no predictive forecasting")));
}

async function testBusinessQueryGroundedResponse() {
  const { service, store } = loadBusinessWithMocks();
  const result = await service.query({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1", question: "Why did renewals decrease?", period: "30d", end: "2026-07-08T12:00:00.000Z" }, { ip: "127.0.0.1", requestId: "req_2" });
  assert.ok(result.answer.includes("Renewals recorded"));
  assert.ok(result.supportingMetrics.some((metric) => metric.key === "revenue" && metric.value === 120));
  assert.ok(store.audits.some((entry) => entry.action === "ai.business_query_executed"));
}

async function testPermissionIsolation() {
  const { service } = loadBusinessWithMocks();
  await assert.rejects(
    () => service.dashboard({ actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_1" }, organizationId: "org_2", period: "30d", end: "2026-07-08T12:00:00.000Z" }),
    (err) => err.statusCode === 403
  );
}

async function run() {
  const tests = [
    testTrendAnalysisAndTenantScope,
    testRecommendationRules,
    testInsightGenerationAndAuditLogging,
    testBusinessQueryGroundedResponse,
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
