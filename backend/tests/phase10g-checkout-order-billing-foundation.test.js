const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "phase10g_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10g_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const userId = "507f1f77bcf86cd799439401";
const productId = "507f1f77bcf86cd799439402";
const planId = "507f1f77bcf86cd799439403";
const orderId = "507f1f77bcf86cd799439404";
const licenseId = "507f1f77bcf86cd799439405";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
}

function loadService(store = {}) {
  store.auditLogs = store.auditLogs || [];
  store.orders = store.orders || [];
  store.licenses = store.licenses || [];
  store.products = store.products || {
    [productId]: { _id: productId, name: "Parentheses Plugin" },
  };
  store.plans = store.plans || {
    [planId]: {
      _id: planId,
      productId,
      name: "Agency",
      allowedSites: 10,
      planType: "agency",
      priceUSD: 199,
      priceLocal: 56000,
      durationDays: 365,
      renewalType: "recurring",
      isActive: true,
    },
  };

  for (const relativePath of [
    "src/services/orderService.js",
    "src/models/Order.js",
    "src/models/License.js",
    "src/models/Plan.js",
    "src/models/Product.js",
    "src/utils/licenseKey.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  const mocks = [
    ["src/models/Order.js", {
      async create(payload) {
        const order = {
          _id: orderId,
          orderNumber: "ORD-10G-000001",
          ...payload,
          async save() {
            this.saved = true;
            return this;
          },
        };
        store.orders.push(order);
        return order;
      },
    }],
    ["src/models/License.js", {
      async create(payload) {
        const license = { _id: `${licenseId}_${store.licenses.length + 1}`, ...payload };
        store.licenses.push(license);
        return license;
      },
    }],
    ["src/models/Plan.js", {
      findOne(filter) {
        const plan = store.plans[filter._id];
        return query(plan && plan.productId === filter.productId && filter.isActive === true ? plan : null);
      },
      findById(id) {
        return query(store.plans[id] || null);
      },
    }],
    ["src/models/Product.js", {
      findById(id) {
        return query(store.products[id] || null);
      },
    }],
    ["src/utils/licenseKey.js", { generateUniqueLicenseKey: async () => `PHASE-10G-${store.licenses.length + 1}` }],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditLogs.push(entry) }],
  ];

  for (const [relativePath, mock] of mocks) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/services/orderService.js"));
}

function makeUser(overrides = {}) {
  return { _id: userId, name: "Customer", email: "customer@example.com", role: "customer", ...overrides };
}

function makeOrder(overrides = {}) {
  return {
    _id: orderId,
    orderNumber: "ORD-10G-000001",
    userId,
    productId,
    planId,
    items: [{ productId, planId, productName: "Parentheses Plugin", planName: "Agency", quantity: 1, unitPrice: 199, subtotal: 199 }],
    amount: 199,
    subtotal: 199,
    taxAmount: 0,
    discountAmount: 0,
    grandTotal: 199,
    currency: "USD",
    status: "draft",
    paymentStatus: "unpaid",
    async save() {
      this.saved = true;
      return this;
    },
    ...overrides,
  };
}

async function testOrderCreation() {
  const store = {};
  const service = loadService(store);
  const order = await service.createCheckoutOrder({
    user: makeUser(),
    items: [{ productId, planId, quantity: 2 }],
    currency: "USD",
    billingDetails: { country: "US" },
    req: { ip: "203.0.113.10", headers: { "user-agent": "phase10g" } },
  });

  assert.strictEqual(order.status, "draft");
  assert.strictEqual(order.paymentStatus, "unpaid");
  assert.strictEqual(order.gateway, "none");
  assert.strictEqual(order.subtotal, 398);
  assert.strictEqual(order.grandTotal, 398);
  assert.strictEqual(order.items.length, 1);
  assert.ok(order.checkoutSessionId.startsWith("chk_"));
  assert.strictEqual(store.auditLogs[0].action, "order.created");
}

function testTotalsValidation() {
  const service = loadService();
  assert.doesNotThrow(() => service.assertTotals({ subtotal: 100, taxAmount: 5, discountAmount: 10, grandTotal: 95 }));
  assert.throws(
    () => service.assertTotals({ subtotal: 100, taxAmount: 5, discountAmount: 10, grandTotal: 94 }),
    /Order totals are invalid/
  );
}

async function testManualCompletionIssuesLicense() {
  const store = {};
  const service = loadService(store);
  const order = makeOrder();
  await service.transitionOrder({ order, status: "completed", actor: { _id: "admin", role: "admin" }, req: { ip: "203.0.113.11" }, reason: "manual_completion" });

  assert.strictEqual(order.status, "completed");
  assert.strictEqual(order.paymentStatus, "paid");
  assert.strictEqual(store.licenses.length, 1);
  assert.strictEqual(order.items[0].licenseId, store.licenses[0]._id);
  assert.strictEqual(order.licenseId, store.licenses[0]._id);
  assert.ok(store.auditLogs.some((entry) => entry.action === "license.issued_from_order"));
  assert.ok(store.auditLogs.some((entry) => entry.action === "order.completed"));
}

async function testInvalidStatusTransitionRejected() {
  const service = loadService();
  await assert.rejects(
    () => service.transitionOrder({ order: makeOrder({ status: "completed" }), status: "pending" }),
    /cannot move backward/
  );
}

async function testCancellationAndRefundRules() {
  const service = loadService();
  const draft = makeOrder({ status: "draft" });
  await service.transitionOrder({ order: draft, status: "cancelled" });
  assert.strictEqual(draft.paymentStatus, "cancelled");

  await assert.rejects(
    () => service.transitionOrder({ order: makeOrder({ status: "draft" }), status: "refunded" }),
    /Only completed orders can be refunded/
  );
}

function testCustomerAccessPayload() {
  const service = loadService();
  const payload = service.orderAccessPayload(makeOrder({ licenseId }));
  assert.strictEqual(payload.downloadEligible, true);
  assert.strictEqual(payload.renewalEligible, true);
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "customer" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

function testPlanLicenseTypeMapping() {
  const service = loadService();
  assert.strictEqual(service.licenseTypeForPlan({ planType: "lifetime", allowedSites: 0 }), "unlimited");
  assert.strictEqual(service.licenseTypeForPlan({ planType: "trial", allowedSites: 1 }), "single_site");
  assert.strictEqual(service.licenseTypeForPlan({ planType: "agency", allowedSites: 10 }), "agency");
}

async function run() {
  const tests = [
    testOrderCreation,
    testTotalsValidation,
    testManualCompletionIssuesLicense,
    testInvalidStatusTransitionRejected,
    testCancellationAndRefundRules,
    testCustomerAccessPayload,
    testPermissions,
    testPlanLicenseTypeMapping,
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
