const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resolve = (rel) => path.join(root, rel);

const now = Date.now();
const daysAgo = (days) => new Date(now - days * 86400000);
const daysFromNow = (days) => new Date(now + days * 86400000);

const store = {
  forecasts: [],
  audits: [],
  orders: [
    { _id: "o1", organizationId: "org_1", userId: "u1", productId: "p1", status: "completed", grandTotal: 100, currency: "USD", createdAt: daysAgo(7) },
    { _id: "o2", organizationId: "org_1", userId: "u2", productId: "p1", status: "paid", grandTotal: 150, currency: "USD", createdAt: daysAgo(3) },
    { _id: "o3", organizationId: "org_1", userId: "u1", productId: "p1", status: "completed", amount: 200, currency: "USD", createdAt: daysAgo(1) },
  ],
  licenses: [
    { _id: "l1", organizationId: "org_1", userId: "u1", productId: "p1", status: "active", expiresAt: daysFromNow(12), activeDomains: [{ domain: "one.test" }], renewalHistory: [{ renewedAt: daysAgo(20) }] },
    { _id: "l2", organizationId: "org_1", userId: "u2", productId: "p1", status: "active", expiresAt: daysFromNow(20), activeDomains: [{ domain: "two.test" }], renewalHistory: [] },
    { _id: "l3", organizationId: "org_1", userId: "u3", productId: "p1", status: "expired", expiresAt: daysAgo(4), activeDomains: [], renewalHistory: [] },
  ],
  downloads: [
    { _id: "d1", organizationId: "org_1", userId: "u1", productId: "p1", status: "completed", fileSizeBytes: 1000, createdAt: daysAgo(5) },
    { _id: "d2", organizationId: "org_1", userId: "u2", productId: "p1", status: "completed", fileSizeBytes: 1200, createdAt: daysAgo(2) },
    { _id: "d3", organizationId: "org_1", userId: "u1", productId: "p1", status: "completed", fileSizeBytes: 900, createdAt: daysAgo(1) },
  ],
  tickets: [
    { _id: "t1", organizationId: "org_1", userId: "u1", status: "open", category: "license", createdAt: daysAgo(2) },
  ],
  usage: [
    { _id: "a1", organizationId: "org_1", totalTokens: 1000, estimatedCost: 0.1, status: "success", createdAt: daysAgo(3) },
    { _id: "a2", organizationId: "org_1", totalTokens: 1500, estimatedCost: 0.15, status: "success", createdAt: daysAgo(1) },
  ],
};

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(value, "$gte")) return new Date(doc[key]) >= new Date(value.$gte);
      if (Object.prototype.hasOwnProperty.call(value, "$in")) return value.$in.includes(doc[key]);
    }
    return doc[key] === value;
  });
}

function queryArray(items) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(items.map((item) => ({ ...item }))),
    catch: (handler) => chain.lean().catch(handler),
  };
  return chain;
}

function mockModule(rel, exportsValue) {
  const file = require.resolve(resolve(rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsValue };
}

mockModule("src/models/Order.js", { find: (filter) => queryArray(store.orders.filter((row) => matches(row, filter))) });
mockModule("src/models/License.js", { find: (filter) => queryArray(store.licenses.filter((row) => matches(row, filter))) });
mockModule("src/models/Download.js", { find: (filter) => queryArray(store.downloads.filter((row) => matches(row, filter))) });
mockModule("src/models/SupportTicket.js", { find: (filter) => queryArray(store.tickets.filter((row) => matches(row, filter))) });
mockModule("src/models/AIUsageLog.js", { find: (filter) => queryArray(store.usage.filter((row) => matches(row, filter))) });
mockModule("src/models/AIForecast.js", {
  create: async (payload) => {
    const forecast = { _id: `forecast_${store.forecasts.length + 1}`, ...payload, createdAt: new Date() };
    store.forecasts.unshift(forecast);
    return forecast;
  },
  find: (filter) => queryArray(store.forecasts.filter((row) => matches(row, filter))),
});
mockModule("src/services/ai/AIPermissionService.js", {
  assert: async (actor, organizationId, permission) => {
    if (permission !== "ai.forecast.read") throw new Error("Unexpected permission");
    if (actor?.role === "admin" || actor?.role === "super_admin") return true;
    if (actor?.activeOrganizationId === organizationId && actor?.permissions?.includes(permission)) return true;
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  },
});
mockModule("src/services/ai/AIAuditService.js", {
  record: async (event, payload) => store.audits.push({ event, payload }),
});

const Forecasting = require("../src/services/aiForecast/AIForecastingService");
const Churn = require("../src/services/aiForecast/AIChurnPredictionService");
const Renewal = require("../src/services/aiForecast/AIRenewalPredictionService");
const Capacity = require("../src/services/aiForecast/AICapacityForecastService");
const Trend = require("../src/services/aiForecast/AITrendForecastService");

const admin = { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" };

async function testForecastGeneration() {
  const result = await Forecasting.generate({
    actor: admin,
    organizationId: "org_1",
    historicalWindowDays: 30,
    forecastWindowDays: 30,
  });
  assert.ok(result.forecastId);
  assert.ok(result.revenueForecast.forecastWindowRevenue > 0);
  assert.ok(result.explainability.supportingMetrics.orders >= 3);
  assert.ok(result.explainability.predictionAssumptions.some((item) => item.includes("moving averages")));
  assert.strictEqual(store.forecasts.length, 1);
}

async function testCustomerHealthRenewalAndCapacity() {
  const signals = await Trend.historicalSignals({ organizationId: "org_1", historicalWindowDays: 30 });
  const renewal = Renewal.predict(signals, 30);
  assert.strictEqual(renewal.supportingMetrics.expiringInWindow, 2);
  assert.ok(renewal.renewals >= 1);

  const churn = Churn.churn(signals, renewal);
  assert.ok(["excellent", "good", "warning", "critical"].includes(churn.health.category));
  assert.ok(churn.renewalProbability > 0);

  const capacity = Capacity.forecast(signals, 30);
  assert.ok(capacity.storageUsage.bytes > 0);
  assert.ok(capacity.aiTokenUsage.tokens > 0);
}

async function testHistoryAuditAndPermissions() {
  const history = await Forecasting.history({ actor: admin, organizationId: "org_1" });
  assert.strictEqual(history.length, 1);
  assert.ok(store.audits.some((entry) => entry.event === "ai.forecast_generated"));
  assert.ok(store.audits.some((entry) => entry.event === "ai.forecast_viewed"));

  await assert.rejects(
    () => Forecasting.generate({
      actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_2" },
      organizationId: "org_1",
    }),
    /Forbidden/,
  );
}

(async () => {
  await testForecastGeneration();
  await testCustomerHealthRenewalAndCapacity();
  await testHistoryAuditAndPermissions();
  console.log("Phase 14I AI predictive forecasting tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
