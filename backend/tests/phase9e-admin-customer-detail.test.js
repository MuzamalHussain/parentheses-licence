const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase9e_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase9e_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const licenseId = "507f1f77bcf86cd799439101";
const orderId = "507f1f77bcf86cd799439201";
const ticketId = "507f1f77bcf86cd799439301";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function id(value) {
  return value?.toString?.() || String(value);
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((item) => matches(doc, item));
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.map(id).includes(id(doc[key]));
    }
    if (expected && typeof expected === "object" && "$regex" in expected) {
      return new RegExp(expected.$regex, expected.$options || "").test(doc[key] || "");
    }
    if (key.includes(".")) return true;
    return id(doc[key]) === id(expected);
  });
}

function query(value) {
  let current = Array.isArray(value) ? [...value] : value;
  const api = {
    select() { return api; },
    populate() { return api; },
    sort(spec) {
      if (Array.isArray(current)) {
        const [[field, dir]] = Object.entries(spec);
        current.sort((a, b) => (new Date(a[field]) - new Date(b[field])) * (dir < 0 ? -1 : 1));
      }
      return api;
    },
    skip(n) {
      if (Array.isArray(current)) current = current.slice(n);
      return api;
    },
    limit(n) {
      if (Array.isArray(current)) current = current.slice(0, n);
      return api;
    },
    lean() { return Promise.resolve(current); },
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };
  return api;
}

function statusCounts(rows, userField = "userId", idValue = userId) {
  const grouped = new Map();
  rows.filter((row) => id(row[userField]) === id(idValue)).forEach((row) => {
    grouped.set(row.status, (grouped.get(row.status) || 0) + 1);
  });
  return Array.from(grouped, ([_id, count]) => ({ _id, count }));
}

function createHarness() {
  const store = {
    users: [
      {
        _id: userId,
        name: "Customer One",
        email: "customer@example.test",
        role: "customer",
        companyName: "Acme",
        emailVerified: true,
        twoFactorEnabled: false,
        isActive: true,
        lastLoginAt: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ],
    licenses: [
      {
        _id: licenseId,
        userId,
        licenseKey: "LIC-ONE",
        status: "active",
        allowedSites: 3,
        activeDomains: [{ domain: "example.com", activatedAt: new Date("2026-02-01T00:00:00Z") }],
        productId: { _id: "product_1", name: "Plugin", slug: "plugin" },
        planId: { _id: "plan_1", name: "Pro" },
        expiresAt: null,
        createdAt: new Date("2026-01-10T00:00:00Z"),
      },
    ],
    orders: [
      {
        _id: orderId,
        userId,
        productId: { name: "Plugin" },
        planId: { name: "Pro" },
        amount: 49,
        currency: "USD",
        gateway: "stripe",
        status: "paid",
        licenseId,
        createdAt: new Date("2026-01-11T00:00:00Z"),
      },
    ],
    downloads: [
      {
        _id: "507f1f77bcf86cd799439401",
        userId,
        licenseId,
        pluginVersionId: { versionNumber: "1.2.3" },
        tokenHash: "secret-token-hash",
        purpose: "customer_download",
        ipAddress: "127.0.0.1",
        usedAt: new Date("2026-01-12T00:00:00Z"),
        createdAt: new Date("2026-01-12T00:00:00Z"),
      },
    ],
    tickets: [
      {
        _id: ticketId,
        userId,
        subject: "Need help",
        status: "open",
        licenseId,
        assignedAgentId: null,
        messages: [{ body: "Hello" }, { body: "Reply" }],
        lastMessageAt: new Date("2026-01-13T00:00:00Z"),
        createdAt: new Date("2026-01-13T00:00:00Z"),
      },
    ],
    auditLogs: [
      {
        _id: "507f1f77bcf86cd799439501",
        actorId: userId,
        actorRole: "customer",
        actorEmail: "customer@example.test",
        action: "auth.login",
        targetType: "User",
        targetId: userId,
        metadata: {},
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-01-14T00:00:00Z"),
      },
      {
        _id: "507f1f77bcf86cd799439502",
        actorId: otherUserId,
        actorRole: "admin",
        actorEmail: "admin@example.test",
        action: "license.suspended",
        targetType: "License",
        targetId: licenseId,
        metadata: {},
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-01-15T00:00:00Z"),
      },
    ],
  };

  const UserMock = {
    findById(value) {
      return query(store.users.find((user) => id(user._id) === id(value)) || null);
    },
  };

  const LicenseMock = {
    find(filter) { return query(store.licenses.filter((row) => matches(row, filter))); },
    countDocuments(filter) { return Promise.resolve(store.licenses.filter((row) => matches(row, filter)).length); },
    aggregate(pipeline) {
      if (pipeline.some((stage) => stage.$facet)) {
        const domains = store.licenses
          .filter((license) => id(license.userId) === userId && license.activeDomains?.length)
          .flatMap((license) => license.activeDomains.map((entry) => ({
            domain: entry.domain,
            activatedAt: entry.activatedAt,
            currentStatus: license.status,
            license: { id: license._id, licenseKey: license.licenseKey, status: license.status },
            product: license.productId,
            plan: license.planId,
          })));
        return Promise.resolve([{ data: domains, totalCount: [{ count: domains.length }] }]);
      }
      if (pipeline.some((stage) => stage.$project?.activeDomainCount)) {
        const count = store.licenses
          .filter((license) => id(license.userId) === userId)
          .reduce((sum, license) => sum + (license.activeDomains?.length || 0), 0);
        return Promise.resolve([{ _id: null, count }]);
      }
      return Promise.resolve(statusCounts(store.licenses));
    },
  };

  const OrderMock = {
    find(filter) { return query(store.orders.filter((row) => matches(row, filter))); },
    countDocuments(filter) { return Promise.resolve(store.orders.filter((row) => matches(row, filter)).length); },
    aggregate() { return Promise.resolve(statusCounts(store.orders)); },
  };

  const DownloadMock = {
    find(filter) {
      const rows = store.downloads
        .filter((row) => matches(row, filter))
        .map(({ tokenHash, ...safe }) => safe);
      return query(rows);
    },
    countDocuments(filter) { return Promise.resolve(store.downloads.filter((row) => matches(row, filter)).length); },
  };

  const SupportTicketMock = {
    find(filter) { return query(store.tickets.filter((row) => matches(row, filter))); },
    countDocuments(filter) { return Promise.resolve(store.tickets.filter((row) => matches(row, filter)).length); },
    aggregate() { return Promise.resolve(statusCounts(store.tickets)); },
  };

  const AuditLogMock = {
    find(filter) { return query(store.auditLogs.filter((row) => matches(row, filter))); },
    countDocuments(filter) { return Promise.resolve(store.auditLogs.filter((row) => matches(row, filter)).length); },
  };

  return { store, mocks: { UserMock, LicenseMock, OrderMock, DownloadMock, SupportTicketMock, AuditLogMock } };
}

function loadController(harness) {
  for (const relativePath of [
    "src/controllers/adminUserController.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/SupportTicket.js",
    "src/models/AuditLog.js",
  ]) {
    clearModule(relativePath);
  }

  for (const [relativePath, mock] of [
    ["src/models/User.js", harness.mocks.UserMock],
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/Order.js", harness.mocks.OrderMock],
    ["src/models/Download.js", harness.mocks.DownloadMock],
    ["src/models/SupportTicket.js", harness.mocks.SupportTicketMock],
    ["src/models/AuditLog.js", harness.mocks.AuditLogMock],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/controllers/adminUserController.js"));
}

function createReq({ params = { id: userId }, query = {}, user = { _id: otherUserId, role: "admin" } } = {}) {
  return { params, query, user, ip: "127.0.0.1", id: "phase9e-request" };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req = createReq()) {
  const res = createRes();
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  return { res, error: nextError };
}

async function testOverviewReturnsCustomerCounts() {
  const controller = loadController(createHarness());
  const { res, error } = await call(controller.getCustomerOverview);

  assert.ifError(error);
  assert.strictEqual(res.body.data.customer.email, "customer@example.test");
  assert.strictEqual(res.body.data.customer.passwordHash, undefined);
  assert.strictEqual(res.body.data.counts.licenses.total, 1);
  assert.strictEqual(res.body.data.counts.orders.total, 1);
  assert.strictEqual(res.body.data.counts.downloads.total, 1);
  assert.strictEqual(res.body.data.counts.supportTickets.total, 1);
  assert.strictEqual(res.body.data.counts.activeDomains.total, 1);
}

async function testLicensesOrdersDownloadsDomainsSupportAndAudit() {
  const controller = loadController(createHarness());

  const licenses = await call(controller.getCustomerLicenses, createReq({ query: { page: "1", limit: "10" } }));
  assert.ifError(licenses.error);
  assert.strictEqual(licenses.res.body.data[0].licenseKey, "LIC-ONE");
  assert.strictEqual(licenses.res.body.pagination.total, 1);

  const orders = await call(controller.getCustomerOrders, createReq({ query: { status: "paid" } }));
  assert.ifError(orders.error);
  assert.strictEqual(orders.res.body.data[0].amount, 49);

  const downloads = await call(controller.getCustomerDownloads);
  assert.ifError(downloads.error);
  assert.strictEqual(downloads.res.body.data[0].ipAddress, "127.0.0.1");
  assert.strictEqual(downloads.res.body.data[0].tokenHash, undefined);

  const domains = await call(controller.getCustomerDomains);
  assert.ifError(domains.error);
  assert.strictEqual(domains.res.body.data[0].domain, "example.com");

  const support = await call(controller.getCustomerSupport);
  assert.ifError(support.error);
  assert.strictEqual(support.res.body.data[0].replyCount, 1);
  assert.strictEqual(support.res.body.data[0].priority, null);

  const audit = await call(controller.getCustomerAudit);
  assert.ifError(audit.error);
  assert.strictEqual(audit.res.body.data.length, 2);
}

async function testInvalidUserReturns404() {
  const controller = loadController(createHarness());
  const { error } = await call(controller.getCustomerOverview, createReq({ params: { id: "507f1f77bcf86cd799439099" } }));

  assert.strictEqual(error.statusCode, 404);
}

async function testValidationRejectsInvalidUserIdAndPagination() {
  const { validateRequest, idParamSchema, customerDetailQuerySchema } = require(path.join(root, "src/validators/schemas.js"));
  const middleware = validateRequest({ params: idParamSchema, query: customerDetailQuerySchema });
  const req = { params: { id: "bad-id" }, query: { page: "0" }, id: "phase9e-validation" };
  const res = createRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 422);
  assert.match(res.body.message, /params.id/);
}

async function testAdminOnlyPermissionPolicy() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  const req = { user: { role: "customer" } };
  let error = null;

  requireRole("admin")(req, createRes(), (err) => { error = err; });

  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testOverviewReturnsCustomerCounts,
    testLicensesOrdersDownloadsDomainsSupportAndAudit,
    testInvalidUserReturns404,
    testValidationRejectsInvalidUserIdAndPagination,
    testAdminOnlyPermissionPolicy,
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
