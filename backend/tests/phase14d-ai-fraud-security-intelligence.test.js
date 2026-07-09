const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14d_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14d_ai_secret_with_enough_entropy";

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
    if (key === "$or") return value.some((inner) => matches(row, inner));
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
  Model.create = async (input) => {
    const row = Model(input);
    list.push(row);
    return row;
  };
  return Model;
}

function loadFraudWithMocks() {
  const store = {
    memberships: [
      doc({ _id: "mem_1", organizationId: "org_1", userId: "user_1", status: "active" }),
      doc({ _id: "mem_2", organizationId: "org_1", userId: "user_2", status: "active" }),
    ],
    users: [
      doc({ _id: "user_1", activeOrganizationId: "org_1", email: "one@example.test", refreshSessions: [
        { sessionId: "s1", tokenHash: "a", expiresAt: new Date("2026-08-01"), device: "Chrome", ipAddress: "10.0.0.1" },
        { sessionId: "s2", tokenHash: "b", expiresAt: new Date("2026-08-01"), device: "Firefox", ipAddress: "10.0.0.2" },
        { sessionId: "s3", tokenHash: "c", expiresAt: new Date("2026-08-01"), device: "Safari", ipAddress: "10.0.0.3" },
        { sessionId: "s4", tokenHash: "d", expiresAt: new Date("2026-08-01"), device: "Edge", ipAddress: "10.0.0.4" },
        { sessionId: "s5", tokenHash: "e", expiresAt: new Date("2026-08-01"), device: "Mobile", ipAddress: "10.0.0.5" },
      ] }),
      doc({ _id: "user_2", activeOrganizationId: "org_1", email: "two@example.test", refreshSessions: [] }),
      doc({ _id: "user_3", activeOrganizationId: "org_2", email: "other@example.test", refreshSessions: [] }),
    ],
    licenses: [
      doc({ _id: "lic_1", organizationId: "org_1", userId: "user_1", productId: "prod_1", status: "active", allowedSites: 1 }),
      doc({ _id: "lic_2", organizationId: "org_2", userId: "user_3", productId: "prod_2", status: "active", allowedSites: 1 }),
    ],
    sites: [
      doc({ _id: "site_1", organizationId: "org_1", licenseId: "lic_1", userId: "user_1", productId: "prod_1", domain: "a.example.com", status: "active", createdAt: new Date("2026-07-07") }),
      doc({ _id: "site_2", organizationId: "org_1", licenseId: "lic_1", userId: "user_1", productId: "prod_1", domain: "b.example.com", status: "active", createdAt: new Date("2026-07-07") }),
      doc({ _id: "site_3", organizationId: "org_1", licenseId: "lic_1", userId: "user_1", productId: "prod_1", domain: "b.example.com", status: "active", blacklisted: true, createdAt: new Date("2026-07-07") }),
      doc({ _id: "site_4", organizationId: "org_1", licenseId: "lic_1", userId: "user_1", productId: "prod_1", domain: "c.example.com", status: "active", createdAt: new Date("2026-07-07") }),
      doc({ _id: "site_5", organizationId: "org_1", licenseId: "lic_1", userId: "user_1", productId: "prod_1", domain: "d.example.com", status: "active", createdAt: new Date("2026-07-07") }),
    ],
    downloads: Array.from({ length: 12 }, (_, index) => doc({ _id: `down_${index}`, organizationId: "org_1", licenseId: "lic_1", productId: "prod_1", status: index < 4 ? "denied" : "completed", createdAt: new Date("2026-07-07") })),
    payments: [
      doc({ _id: "pay_1", organizationId: "org_1", status: "failed", amount: 50, createdAt: new Date("2026-07-07") }),
      doc({ _id: "pay_2", organizationId: "org_1", status: "failed", amount: 50, createdAt: new Date("2026-07-07") }),
      doc({ _id: "pay_3", organizationId: "org_1", status: "refunded", amount: 50, createdAt: new Date("2026-07-07") }),
    ],
    orders: [
      doc({ _id: "ord_1", organizationId: "org_1", status: "failed", paymentStatus: "failed", createdAt: new Date("2026-07-07") }),
      doc({ _id: "ord_2", organizationId: "org_1", status: "failed", paymentStatus: "failed", createdAt: new Date("2026-07-07") }),
    ],
    apiKeys: [
      doc({ _id: "key_1", ownerId: "user_1", status: "active", scopes: ["admin"], usageCount: 6001, lastUsedIp: "10.0.0.9" }),
      doc({ _id: "key_2", ownerId: "user_2", status: "active", scopes: ["products.read"], usageCount: 10 }),
      doc({ _id: "key_3", ownerId: "user_3", status: "active", scopes: ["admin"], usageCount: 99999 }),
    ],
    audits: [
      doc({ _id: "audit_1", action: "auth.login_failed", metadata: { organizationId: "org_1" }, createdAt: new Date("2026-07-07") }),
      doc({ _id: "audit_2", action: "auth.login_failed", metadata: { organizationId: "org_1" }, createdAt: new Date("2026-07-07") }),
      doc({ _id: "audit_3", action: "auth.refresh_reuse_rejected", metadata: { organizationId: "org_1" }, createdAt: new Date("2026-07-07") }),
      doc({ _id: "audit_4", action: "auth.password_reset_completed", metadata: { organizationId: "org_1" }, createdAt: new Date("2026-07-07") }),
      doc({ _id: "audit_5", action: "api_key.rejected", metadata: { organizationId: "org_1" }, createdAt: new Date("2026-07-07") }),
    ],
    risks: [],
    auditWrites: [],
    usage: [],
  };

  [
    "src/services/aiFraud/AIRiskScoringService.js",
    "src/services/aiFraud/AISecurityAnalyzer.js",
    "src/services/aiFraud/AIRiskRecommendationService.js",
    "src/services/aiFraud/AIFraudReportService.js",
    "src/services/aiFraud/AIFraudDetectionService.js",
    "src/models/AIFraudRisk.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/LicenseSite.js",
    "src/models/Download.js",
    "src/models/Payment.js",
    "src/models/Order.js",
    "src/models/ApiKey.js",
    "src/models/AuditLog.js",
    "src/models/OrganizationMembership.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIRequestService.js",
    "src/services/ai/AIAuditService.js",
  ].forEach(clearModule);

  setMock("src/models/AIFraudRisk.js", model(store.risks, "risk"));
  setMock("src/models/User.js", model(store.users, "user"));
  setMock("src/models/License.js", model(store.licenses, "license"));
  setMock("src/models/LicenseSite.js", model(store.sites, "site"));
  setMock("src/models/Download.js", model(store.downloads, "download"));
  setMock("src/models/Payment.js", model(store.payments, "payment"));
  setMock("src/models/Order.js", model(store.orders, "order"));
  setMock("src/models/ApiKey.js", model(store.apiKeys, "key"));
  setMock("src/models/AuditLog.js", model(store.audits, "audit"));
  setMock("src/models/OrganizationMembership.js", model(store.memberships, "membership"));
  setMock("src/services/ai/AIPermissionService.js", {
    assert: async (actor, organizationId, permission) => {
      if (actor?.role === "admin") return true;
      if (organizationId !== actor?.activeOrganizationId || permission !== "ai.security.read") {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }
      return true;
    },
  });
  setMock("src/services/ai/AIRequestService.js", {
    simulateRequest: async (input) => {
      store.usage.push(input);
      return { usage: { promptTokens: input.promptTokens, completionTokens: input.completionTokens, totalTokens: input.promptTokens + input.completionTokens, estimatedCost: 0 }, providerId: "test" };
    },
  });
  setMock("src/services/ai/AIAuditService.js", { record: async (action, entry) => store.auditWrites.push({ action, entry }) });

  return {
    store,
    scoring: require(path.join(root, "src/services/aiFraud/AIRiskScoringService.js")),
    analyzer: require(path.join(root, "src/services/aiFraud/AISecurityAnalyzer.js")),
    recommendations: require(path.join(root, "src/services/aiFraud/AIRiskRecommendationService.js")),
    service: require(path.join(root, "src/services/aiFraud/AIFraudDetectionService.js")),
  };
}

async function testRiskScoring() {
  const { scoring } = loadFraudWithMocks();
  const scored = scoring.scoreFactors([
    scoring.factor("a", "A", 35),
    scoring.factor("b", "B", 40),
  ]);
  assert.strictEqual(scored.score, 75);
  assert.strictEqual(scored.riskLevel, "high");
  assert.strictEqual(scored.confidenceLevel, "medium");
}

async function testFraudDetectionFindsEvidence() {
  const { analyzer } = loadFraudWithMocks();
  const analysis = await analyzer.analyze({ organizationId: "org_1", period: "7d", end: "2026-07-08T00:00:00.000Z" });
  assert.ok(analysis.risks.some((risk) => risk.entityType === "license" && risk.score >= 70));
  assert.ok(analysis.risks.some((risk) => risk.entityType === "download"));
  assert.ok(analysis.risks.some((risk) => risk.entityType === "api_key"));
  assert.strictEqual(analysis.risks.some((risk) => risk.evidence.some((item) => String(item.value).includes("99999"))), false);
}

async function testRecommendationEngineIsAdvisoryOnly() {
  const { analyzer, recommendations } = loadFraudWithMocks();
  const analysis = await analyzer.analyze({ organizationId: "org_1", period: "7d", end: "2026-07-08T00:00:00.000Z" });
  const recs = recommendations.generate(analysis.risks);
  assert.ok(recs.some((rec) => rec.action === "Suspend License"));
  assert.ok(recs.every((rec) => rec.automaticAction === false));
}

async function testSecurityDashboardAndAudit() {
  const { service, store } = loadFraudWithMocks();
  const result = await service.dashboard({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1", period: "7d", end: "2026-07-08T00:00:00.000Z" }, { ip: "127.0.0.1", requestId: "req_14d" });
  assert.ok(result.currentRisks.length >= 4);
  assert.ok(result.topThreats.length > 0);
  assert.ok(result.recommendations.every((rec) => rec.automaticAction === false));
  assert.ok(result.explainability.limitations.some((item) => item.includes("never executed automatically")));
  assert.ok(store.risks.length > 0);
  assert.ok(store.auditWrites.some((entry) => entry.action === "ai.security_analysis_executed"));
  assert.ok(store.auditWrites.some((entry) => entry.action === "ai.risk_generated"));
}

async function testPermissionIsolation() {
  const { service } = loadFraudWithMocks();
  await assert.rejects(
    () => service.dashboard({ actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_1" }, organizationId: "org_2", period: "7d", end: "2026-07-08T00:00:00.000Z" }),
    (err) => err.statusCode === 403
  );
}

async function run() {
  const tests = [
    testRiskScoring,
    testFraudDetectionFindsEvidence,
    testRecommendationEngineIsAdvisoryOnly,
    testSecurityDashboardAndAudit,
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
