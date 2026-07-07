const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase11a_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase11a_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function loadAnalyticsWithMocks(store = {}) {
  store.calls = store.calls || [];
  for (const relativePath of [
    "src/services/analytics/AnalyticsService.js",
    "src/services/analytics/AnalyticsRepository.js",
    "src/services/analytics/AnalyticsAggregator.js",
    "src/services/analytics/AnalyticsCacheService.js",
    "src/utils/ttlCache.js",
  ]) clearModule(relativePath);

  const repository = {
    async fetchExecutive(filter) {
      store.calls.push({ name: "executive", filter });
      return {
        revenue: [{ _id: "USD", total: 250, count: 5 }],
        orderStatuses: [{ _id: "completed", count: 5, total: 250 }],
        customerCounts: [{ total: 12, newInRange: 3 }],
        licenseStatuses: [{ _id: "active", count: 8 }, { _id: "trial", count: 1 }],
        downloads: [{ _id: "completed", count: 20 }],
        renewals: [{ count: 2 }],
        growth: [{ _id: "2026-07-01", count: 1 }],
      };
    },
    async fetchProductAnalytics(filter) {
      store.calls.push({ name: "products", filter });
      return {
        products: [{ _id: "prod_1", name: "Parentheses" }],
        sales: [{ _id: "prod_1", sales: 3, revenue: 150 }],
        downloads: [{ _id: "prod_1", downloads: 10 }],
        licenses: [{ _id: "prod_1", licenses: 4 }],
        activeSites: [{ _id: "prod_1", activeSites: 6 }],
        renewals: [{ _id: "prod_1", renewals: 1 }],
        latestVersions: [{ productId: "prod_1", versionNumber: "2.0.0" }],
      };
    },
    async fetchVersionAnalytics(filter) {
      store.calls.push({ name: "versions", filter });
      return { versions: [{ _id: "ver_1", versionNumber: "2.0.0", downloadCount: 7 }], downloads: [{ _id: "ver_1", downloads: 9 }], activeInstallations: [{ _id: "2.0.0", activeInstallations: 4 }], stable: { versionNumber: "2.0.0" } };
    },
    async fetchCustomerAnalytics(filter) {
      store.calls.push({ name: "customers", filter });
      return { newCustomers: 3, activeCustomers: 5, returningCustomers: [{ count: 2 }], topCustomers: [{ name: "Ada", revenue: 99 }], growth: [] };
    },
    async fetchLicenseAnalytics(filter) {
      store.calls.push({ name: "licenses", filter });
      return [{ _id: "active", count: 8 }, { _id: "revoked", count: 1 }];
    },
    async fetchPaymentAnalytics(filter) {
      store.calls.push({ name: "payments", filter });
      return [{ _id: "succeeded", count: 4, amount: 200 }, { _id: "failed", count: 1, amount: 0 }];
    },
    async fetchDownloadAnalytics(filter) {
      store.calls.push({ name: "downloads", filter });
      return { byProduct: [{ _id: "prod_1", count: 8 }], byVersion: [{ _id: "ver_1", count: 5 }], byDate: [{ _id: "2026-07-01", count: 3 }] };
    },
  };

  const repoPath = clearModule("src/services/analytics/AnalyticsRepository.js");
  require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: repository };

  const cachePath = clearModule("src/utils/ttlCache.js");
  require.cache[cachePath] = {
    id: cachePath,
    filename: cachePath,
    loaded: true,
    exports: { getCached: async (_key, _ttl, factory) => factory() },
  };

  return require(path.join(root, "src/services/analytics/AnalyticsService.js"));
}

function testDateFilters() {
  const service = loadAnalyticsWithMocks();
  const today = service.parseDateFilters({ period: "today" });
  assert.strictEqual(today.period, "today");
  assert.strictEqual(today.start.getHours(), 0);

  const custom = service.parseDateFilters({ period: "custom", start: "2026-01-01", end: "2026-01-31" });
  assert.strictEqual(custom.start.toISOString().slice(0, 10), "2026-01-01");
  assert.strictEqual(custom.end.toISOString().slice(0, 10), "2026-01-31");
}

async function testExecutiveAggregationWidgets() {
  const service = loadAnalyticsWithMocks();
  const data = await service.executive({ period: "30d" });
  assert.strictEqual(data.revenue.primary, 250);
  assert.strictEqual(data.orders.completed, 5);
  assert.strictEqual(data.customers.newInRange, 3);
  assert.strictEqual(data.licenses.total, 9);
  assert.ok(data.widgets.some((widget) => widget.key === "revenue"));
  assert.strictEqual(data.exports.csv, true);
}

async function testProductVersionCustomerCalculations() {
  const service = loadAnalyticsWithMocks();
  const products = await service.productAnalytics({ period: "7d" });
  assert.strictEqual(products.products[0].sales, 3);
  assert.strictEqual(products.products[0].activeSites, 6);
  assert.strictEqual(products.products[0].latestVersion.versionNumber, "2.0.0");

  const versions = await service.versionAnalytics({ period: "7d" });
  assert.strictEqual(versions.versions[0].downloads, 9);
  assert.strictEqual(versions.versions[0].activeInstallations, 4);

  const customers = await service.customerAnalytics({ period: "7d" });
  assert.strictEqual(customers.activeCustomers, 5);
  assert.strictEqual(customers.returningCustomers, 2);
}

async function testLicensePaymentDownloadCalculations() {
  const service = loadAnalyticsWithMocks();
  const licenses = await service.licenseAnalytics();
  assert.strictEqual(licenses.statuses.active, 8);
  assert.strictEqual(licenses.statuses.revoked, 1);

  const payments = await service.paymentAnalytics();
  assert.strictEqual(payments.statuses.succeeded, 4);
  assert.strictEqual(payments.averageOrderValue, 50);

  const downloads = await service.downloadAnalytics();
  assert.strictEqual(downloads.byProduct[0].count, 8);
  assert.strictEqual(downloads.byDate[0]._id, "2026-07-01");
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin", "support")({ user: { role: "customer" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testDateFilters,
    testExecutiveAggregationWidgets,
    testProductVersionCustomerCalculations,
    testLicensePaymentDownloadCalculations,
    testPermissions,
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
