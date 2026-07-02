const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    populate() { return this; },
    lean() { return this; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req = {}) {
  const res = createRes();
  let nextError = null;
  await handler({ query: {}, params: {}, ...req }, res, (err) => { nextError = err; });
  if (nextError) throw nextError;
  return res;
}

function installModule(relativePath, exports) {
  const resolved = clearModule(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

async function testPaginationClampsLimitsAndComputesSkip() {
  const { getPagination, paginationMeta } = require(path.join(root, "src/utils/pagination.js"));

  assert.deepStrictEqual(getPagination({ page: "3", limit: "500" }, { maxLimit: 50 }), {
    page: 3,
    limit: 50,
    skip: 100,
  });
  assert.deepStrictEqual(paginationMeta({ page: 3, limit: 50, total: 101 }), {
    page: 3,
    limit: 50,
    total: 101,
    pages: 3,
  });
}

async function testTtlCachePreventsRepeatedFactoryWork() {
  const { getCached, clearCache } = require(path.join(root, "src/utils/ttlCache.js"));
  clearCache("phase7l:");
  let calls = 0;

  const first = await getCached("phase7l:item", 60_000, async () => {
    calls += 1;
    return { value: calls };
  });
  const second = await getCached("phase7l:item", 60_000, async () => {
    calls += 1;
    return { value: calls };
  });

  assert.deepStrictEqual(first, { value: 1 });
  assert.deepStrictEqual(second, { value: 1 });
  assert.strictEqual(calls, 1);
  clearCache("phase7l:");
}

async function testOrderStatsUsesSingleAggregationAndCache() {
  let aggregateCalls = 0;
  let findCalls = 0;
  const OrderMock = {
    aggregate() {
      aggregateCalls += 1;
      return Promise.resolve([
        { _id: "paid", count: 2, totalRevenueUSD: 45 },
        { _id: "pending", count: 1, totalRevenueUSD: 0 },
      ]);
    },
    find() {
      findCalls += 1;
      return query([]);
    },
  };

  installModule("src/models/Order.js", OrderMock);
  installModule("src/models/Payment.js", {});
  clearModule("src/controllers/adminOrderController.js");
  const controller = require(path.join(root, "src/controllers/adminOrderController.js"));

  let res = await call(controller.getOrderStats);
  assert.strictEqual(res.body.data.totalRevenueUSD, 45);
  assert.strictEqual(res.body.data.stats.paid, 2);

  res = await call(controller.getOrderStats);
  assert.strictEqual(res.body.data.stats.pending, 1);
  assert.strictEqual(aggregateCalls, 1);
  assert.strictEqual(findCalls, 0);
}

async function testDashboardStatsAreCachedAndLeanQueriesUsed() {
  let licenseAggregateCalls = 0;
  let recentLicenseLeanCalled = false;
  let recentAuditLeanCalled = false;

  const UserMock = {
    countDocuments() {
      return Promise.resolve(1);
    },
  };
  const LicenseMock = {
    aggregate() {
      licenseAggregateCalls += 1;
      return Promise.resolve([{ _id: "active", count: 3 }]);
    },
    find() {
      return {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        populate() { return this; },
        lean() {
          recentLicenseLeanCalled = true;
          return query([]);
        },
      };
    },
  };
  const AuditLogMock = {
    find() {
      return {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        populate() { return this; },
        lean() {
          recentAuditLeanCalled = true;
          return query([]);
        },
      };
    },
  };

  installModule("src/models/User.js", UserMock);
  installModule("src/models/License.js", LicenseMock);
  installModule("src/models/AuditLog.js", AuditLogMock);
  clearModule("src/controllers/adminDashboardController.js");
  const controller = require(path.join(root, "src/controllers/adminDashboardController.js"));

  await call(controller.getDashboardStats);
  const res = await call(controller.getDashboardStats);

  assert.strictEqual(res.body.data.licenses.active, 3);
  assert.strictEqual(licenseAggregateCalls, 1);
  assert.strictEqual(recentLicenseLeanCalled, true);
  assert.strictEqual(recentAuditLeanCalled, true);
}

async function run() {
  const tests = [
    testPaginationClampsLimitsAndComputesSkip,
    testTtlCachePreventsRepeatedFactoryWork,
    testOrderStatsUsesSingleAggregationAndCache,
    testDashboardStatsAreCachedAndLeanQueriesUsed,
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
