const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    session: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function restoreStore(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  for (const [key, value] of Object.entries(snapshot)) target[key] = value;
}

function createDoc(collection, id, data) {
  const doc = {
    ...data,
    _id: id,
    async save() {
      collection[id] = { ...collection[id], ...this };
      return this;
    },
  };
  return doc;
}

function createHarness(options = {}) {
  const store = {
    orders: {
      order_1: {
        _id: "order_1",
        userId: "user_1",
        productId: "product_1",
        planId: "plan_1",
        amount: 25,
        currency: "USD",
        gateway: "stripe",
        status: "pending",
        couponCode: options.noCoupon ? "" : "SAVE10",
        gatewayCheckoutId: "",
        licenseId: null,
      },
    },
    payments: {},
    licenses: {},
    plans: {
      plan_1: {
        _id: "plan_1",
        allowedSites: 3,
        durationDays: 365,
        renewalType: "recurring",
      },
    },
    coupons: {
      SAVE10: { code: "SAVE10", usedCount: 0 },
    },
    auditLogs: [],
    emails: [],
  };

  let licenseCreateFailures = options.licenseCreateFailures || 0;
  let licenseSequence = 0;
  let paymentSequence = 0;

  const session = {
    async withTransaction(callback) {
      const snapshot = cloneStore(store);
      try {
        await callback();
      } catch (err) {
        restoreStore(store, snapshot);
        throw err;
      }
    },
    async endSession() {},
  };

  const mongooseMock = {
    startSession: async () => session,
  };

  const OrderMock = {
    findById(id) {
      const raw = store.orders[id];
      return query(raw ? createDoc(store.orders, id, raw) : null);
    },
  };

  const PaymentMock = {
    findOne(filter) {
      const found = Object.values(store.payments).find(
        (payment) =>
          payment.gateway === filter.gateway &&
          payment.gatewayTransactionId === filter.gatewayTransactionId
      );
      return query(found ? createDoc(store.payments, found._id, found) : null);
    },
    async create(docs) {
      const created = docs.map((doc) => {
        const duplicate = Object.values(store.payments).find(
          (payment) =>
            payment.gateway === doc.gateway &&
            payment.gatewayTransactionId === doc.gatewayTransactionId
        );
        if (duplicate) {
          const err = new Error("duplicate payment");
          err.code = 11000;
          throw err;
        }
        paymentSequence += 1;
        const id = `payment_${paymentSequence}`;
        store.payments[id] = { ...doc, _id: id };
        return createDoc(store.payments, id, store.payments[id]);
      });
      return created;
    },
  };

  const LicenseMock = {
    exists(filter) {
      const found = Object.values(store.licenses).some((license) => license.licenseKey === filter.licenseKey);
      return query(found ? { _id: "existing" } : null);
    },
    findById(id) {
      const raw = store.licenses[id];
      return query(raw ? createDoc(store.licenses, id, raw) : null);
    },
    findOne(filter) {
      const found = Object.values(store.licenses).find((license) => {
        if (filter.orderId && license.orderId !== filter.orderId) return false;
        if (filter.userId && license.userId !== filter.userId) return false;
        if (filter.productId && license.productId !== filter.productId) return false;
        if (filter.planId && license.planId !== filter.planId) return false;
        return true;
      });
      return query(found ? createDoc(store.licenses, found._id, found) : null);
    },
    async create(docs) {
      if (licenseCreateFailures > 0) {
        licenseCreateFailures -= 1;
        throw new Error("license insert failed");
      }
      const created = docs.map((doc) => {
        const duplicate = Object.values(store.licenses).find((license) => license.orderId === doc.orderId);
        if (duplicate) {
          const err = new Error("duplicate license");
          err.code = 11000;
          throw err;
        }
        licenseSequence += 1;
        const id = `license_${licenseSequence}`;
        store.licenses[id] = { ...doc, _id: id };
        return createDoc(store.licenses, id, store.licenses[id]);
      });
      return created;
    },
  };

  const PlanMock = {
    findById(id) {
      return query(store.plans[id] || null);
    },
  };

  const CouponMock = {
    async updateOne(filter, update) {
      const coupon = store.coupons[filter.code];
      if (coupon && update.$inc?.usedCount) {
        coupon.usedCount += update.$inc.usedCount;
      }
      return { modifiedCount: coupon ? 1 : 0 };
    },
    findOne() {
      return query(null);
    },
  };

  const UserMock = {
    findById(id) {
      return query({ _id: id, name: "Ada", email: "ada@example.test" });
    },
  };

  const ProductMock = {
    findById(id) {
      return query({ _id: id, name: "Parentheses" });
    },
  };

  const auditLogMock = {
    writeAuditLog: async (entry) => {
      store.auditLogs.push(entry);
    },
  };

  const notificationServiceMock = {
    sendLicensePurchasedEmail: async (message) => {
      store.emails.push(message);
      return { success: true };
    },
  };

  return {
    store,
    mocks: {
      mongooseMock,
      OrderMock,
      PaymentMock,
      LicenseMock,
      PlanMock,
      CouponMock,
      UserMock,
      ProductMock,
      auditLogMock,
      notificationServiceMock,
    },
  };
}

function loadPaymentService(harness) {
  clearModule("src/services/paymentService.js");

  const mappings = [
    ["mongoose", harness.mocks.mongooseMock],
    ["src/models/Order.js", harness.mocks.OrderMock],
    ["src/models/Payment.js", harness.mocks.PaymentMock],
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/Plan.js", harness.mocks.PlanMock],
    ["src/models/Coupon.js", harness.mocks.CouponMock],
    ["src/models/User.js", harness.mocks.UserMock],
    ["src/models/Product.js", harness.mocks.ProductMock],
    ["src/utils/auditLog.js", harness.mocks.auditLogMock],
    ["src/services/notificationService.js", harness.mocks.notificationServiceMock],
  ];

  for (const [relativePath, exports] of mappings) {
    const resolved = relativePath === "mongoose"
      ? require.resolve("mongoose")
      : clearModule(relativePath);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }

  return require(path.join(root, "src/services/paymentService.js"));
}

function paymentDetails() {
  return {
    gateway: "stripe",
    gatewayTransactionId: "pi_123",
    amount: 25,
    currency: "USD",
    rawWebhookPayload: { id: "evt_123" },
  };
}

async function testSuccessfulPaymentCompletionCreatesAllRecords() {
  const harness = createHarness();
  const { confirmOrderPaid } = loadPaymentService(harness);

  const result = await confirmOrderPaid("order_1", paymentDetails());

  assert.strictEqual(result.alreadyProcessed, false);
  assert.strictEqual(harness.store.orders.order_1.status, "paid");
  assert.strictEqual(Object.keys(harness.store.payments).length, 1);
  assert.strictEqual(Object.keys(harness.store.licenses).length, 1);
  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 1);
  assert.strictEqual(harness.store.auditLogs.length, 1);
  assert.strictEqual(harness.store.emails.length, 1);
}

async function testFailureDuringLicenseCreationRollsBackAllState() {
  const harness = createHarness({ licenseCreateFailures: 1 });
  const { confirmOrderPaid } = loadPaymentService(harness);

  await assert.rejects(() => confirmOrderPaid("order_1", paymentDetails()), /license insert failed/);

  assert.strictEqual(harness.store.orders.order_1.status, "pending");
  assert.strictEqual(Object.keys(harness.store.payments).length, 0);
  assert.strictEqual(Object.keys(harness.store.licenses).length, 0);
  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 0);
}

async function testRetryAfterFailureSucceedsOnce() {
  const harness = createHarness({ licenseCreateFailures: 1 });
  const { confirmOrderPaid } = loadPaymentService(harness);

  await assert.rejects(() => confirmOrderPaid("order_1", paymentDetails()), /license insert failed/);
  const result = await confirmOrderPaid("order_1", paymentDetails());

  assert.strictEqual(result.alreadyProcessed, false);
  assert.strictEqual(Object.keys(harness.store.payments).length, 1);
  assert.strictEqual(Object.keys(harness.store.licenses).length, 1);
  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 1);
}

async function testDuplicatePaymentConfirmationIsIdempotent() {
  const harness = createHarness();
  const { confirmOrderPaid } = loadPaymentService(harness);

  await confirmOrderPaid("order_1", paymentDetails());
  const replay = await confirmOrderPaid("order_1", paymentDetails());

  assert.strictEqual(replay.alreadyProcessed, true);
  assert.strictEqual(Object.keys(harness.store.payments).length, 1);
  assert.strictEqual(Object.keys(harness.store.licenses).length, 1);
  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 1);
  assert.strictEqual(harness.store.emails.length, 1);
}

async function testExistingPaidOrderReturnsSafeResult() {
  const harness = createHarness();
  harness.store.orders.order_1.status = "paid";
  harness.store.orders.order_1.licenseId = "license_existing";
  harness.store.payments.payment_existing = {
    _id: "payment_existing",
    orderId: "order_1",
    gateway: "stripe",
    gatewayTransactionId: "pi_123",
    amount: 25,
    currency: "USD",
    status: "succeeded",
  };
  harness.store.licenses.license_existing = {
    _id: "license_existing",
    licenseKey: "EXIST-ING0-KEY0-0000",
    orderId: "order_1",
    userId: "user_1",
    productId: "product_1",
    planId: "plan_1",
  };

  const { confirmOrderPaid } = loadPaymentService(harness);
  const result = await confirmOrderPaid("order_1", paymentDetails());

  assert.strictEqual(result.alreadyProcessed, true);
  assert.strictEqual(Object.keys(harness.store.payments).length, 1);
  assert.strictEqual(Object.keys(harness.store.licenses).length, 1);
  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 0);
}

async function testCouponUsageIncrementsOnceOnly() {
  const harness = createHarness();
  const { confirmOrderPaid } = loadPaymentService(harness);

  await confirmOrderPaid("order_1", paymentDetails());
  await confirmOrderPaid("order_1", paymentDetails());
  await confirmOrderPaid("order_1", paymentDetails());

  assert.strictEqual(harness.store.coupons.SAVE10.usedCount, 1);
}

async function testWebhookDrivenPaymentCompletionStillWorks() {
  clearModule("src/controllers/stripeWebhookController.js");

  const event = {
    id: "evt_7c",
    type: "checkout.session.completed",
    data: {
      object: {
        metadata: { orderId: "order_1" },
        payment_intent: "pi_123",
        amount_total: 2500,
        currency: "usd",
      },
    },
  };
  let completionCalled = false;

  const stripeServicePath = clearModule("src/services/stripeService.js");
  require.cache[stripeServicePath] = {
    id: stripeServicePath,
    filename: stripeServicePath,
    loaded: true,
    exports: { constructWebhookEvent: () => event },
  };

  const paymentServicePath = clearModule("src/services/paymentService.js");
  require.cache[paymentServicePath] = {
    id: paymentServicePath,
    filename: paymentServicePath,
    loaded: true,
    exports: {
      confirmOrderPaid: async () => {
        completionCalled = true;
      },
    },
  };

  const guardPath = clearModule("src/utils/webhookGuard.js");
  require.cache[guardPath] = {
    id: guardPath,
    filename: guardPath,
    loaded: true,
    exports: {
      beginWebhookProcessing: async () => ({ shouldProcess: true, status: "processing", attempt: "created" }),
      markWebhookProcessed: async () => {},
      markWebhookFailed: async () => {},
    },
  };

  const orderPath = clearModule("src/models/Order.js");
  require.cache[orderPath] = {
    id: orderPath,
    filename: orderPath,
    loaded: true,
    exports: { updateOne: async () => ({ modifiedCount: 1 }) },
  };

  const { handleStripeWebhook } = require(path.join(root, "src/controllers/stripeWebhookController.js"));
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handleStripeWebhook({ headers: { "stripe-signature": "valid" }, body: Buffer.from("{}") }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(completionCalled, true);
}

async function run() {
  const tests = [
    testSuccessfulPaymentCompletionCreatesAllRecords,
    testFailureDuringLicenseCreationRollsBackAllState,
    testRetryAfterFailureSucceedsOnce,
    testDuplicatePaymentConfirmationIsIdempotent,
    testExistingPaidOrderReturnsSafeResult,
    testCouponUsageIncrementsOnceOnly,
    testWebhookDrivenPaymentCompletionStillWorks,
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
