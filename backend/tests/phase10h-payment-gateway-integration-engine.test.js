const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "phase10h_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10h_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
}

function loadManager(store = {}) {
  store.auditLogs = store.auditLogs || [];
  store.processed = store.processed || [];
  store.failed = store.failed || [];
  store.confirmed = store.confirmed || [];
  store.orders = store.orders || {
    order_1: {
      _id: "order_1",
      orderNumber: "ORD-10H",
      amount: 25,
      grandTotal: 25,
      currency: "USD",
      status: "pending",
      paymentStatus: "pending",
      gateway: "stripe",
    },
  };
  store.payments = store.payments || {};

  for (const relativePath of [
    "src/services/paymentManager.js",
    "src/services/paymentProviderRegistry.js",
    "src/services/paymentProviders/StripePaymentProvider.js",
    "src/services/paymentProviders/LocalPspPaymentProvider.js",
    "src/services/stripeService.js",
    "src/services/localPspService.js",
    "src/services/paymentService.js",
    "src/models/Order.js",
    "src/models/Payment.js",
    "src/utils/webhookGuard.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  const mappings = [
    ["src/services/stripeService.js", {
      createCheckoutSession: async () => ({ id: "cs_10h", url: "https://stripe.test/checkout", expires_at: 2000000000 }),
      constructWebhookEvent: (_raw, signature) => {
        if (signature !== "valid") throw new Error("bad signature");
        return store.stripeEvent;
      },
    }],
    ["src/services/localPspService.js", {
      createLocalCheckout: async () => ({ checkoutId: "local_10h", checkoutUrl: "https://local.test/checkout" }),
      verifyWebhookSignature: (_raw, signature) => signature === "valid",
    }],
    ["src/services/paymentService.js", {
      confirmOrderPaid: async (orderId, details) => {
        store.confirmed.push({ orderId, details });
        return { order: store.orders[orderId], license: { _id: "license_1" }, alreadyProcessed: false };
      },
    }],
    ["src/models/Order.js", {
      findById(id) {
        return query(store.orders[id] || null);
      },
      async updateOne(filter, update) {
        const id = filter._id || Object.keys(store.orders).find((key) => store.orders[key].gatewayCheckoutId === filter.gatewayCheckoutId);
        if (id && store.orders[id]) Object.assign(store.orders[id], update);
        return { modifiedCount: id ? 1 : 0 };
      },
    }],
    ["src/models/Payment.js", {
      async updateOne(filter, update) {
        store.payments[filter.gatewayTransactionId || "unknown"] = { filter, update };
        return { modifiedCount: 1 };
      },
    }],
    ["src/utils/webhookGuard.js", {
      beginWebhookProcessing: async ({ eventId }) => (
        store.duplicateEventId === eventId
          ? { shouldProcess: false, status: "processed", attempt: "duplicate" }
          : { shouldProcess: true, status: "processing", attempt: "created" }
      ),
      markWebhookProcessed: async (gateway, eventId) => store.processed.push({ gateway, eventId }),
      markWebhookFailed: async (gateway, eventId, error) => store.failed.push({ gateway, eventId, error }),
    }],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditLogs.push(entry) }],
  ];

  for (const [relativePath, exports] of mappings) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  return require(path.join(root, "src/services/paymentManager.js"));
}

async function testStripeCheckout() {
  const manager = loadManager();
  const session = await manager.createCheckoutSession("stripe", {
    order: { _id: "order_1", amount: 25, currency: "USD" },
    productName: "Parentheses",
    planName: "Solo",
    successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel",
    customerEmail: "ada@example.test",
  });
  assert.strictEqual(session.provider, "stripe");
  assert.strictEqual(session.checkoutUrl, "https://stripe.test/checkout");
  assert.strictEqual(session.sessionId, "cs_10h");
}

async function testStripeWebhookCompletesOrder() {
  const store = {
    stripeEvent: {
      id: "evt_10h_success",
      type: "checkout.session.completed",
      data: { object: { id: "cs_10h", metadata: { orderId: "order_1" }, payment_intent: "pi_10h", amount_total: 2500, currency: "usd" } },
    },
  };
  const manager = loadManager(store);
  const event = manager.parseWebhookEvent("stripe", { rawBody: Buffer.from("{}"), headers: { "stripe-signature": "valid" } });
  await manager.processWebhookEvent(event);
  assert.strictEqual(store.confirmed.length, 1);
  assert.strictEqual(store.confirmed[0].details.gateway, "stripe");
  assert.strictEqual(store.processed[0].eventId, "evt_10h_success");
  assert.ok(store.auditLogs.some((entry) => entry.action === "payment.completed"));
}

async function testDuplicateWebhookSkipped() {
  const store = {
    duplicateEventId: "evt_duplicate",
    stripeEvent: {
      id: "evt_duplicate",
      type: "checkout.session.completed",
      data: { object: { metadata: { orderId: "order_1" }, payment_intent: "pi_dup", amount_total: 2500, currency: "usd" } },
    },
  };
  const manager = loadManager(store);
  const event = manager.parseWebhookEvent("stripe", { rawBody: Buffer.from("{}"), headers: { "stripe-signature": "valid" } });
  const result = await manager.processWebhookEvent(event);
  assert.strictEqual(result.duplicate, true);
  assert.strictEqual(store.confirmed.length, 0);
}

async function testLocalPspCallback() {
  const store = {};
  const manager = loadManager(store);
  const raw = Buffer.from(JSON.stringify({
    event_id: "local_evt_10h",
    event_type: "payment.succeeded",
    transaction_id: "local_txn_10h",
    order_id: "order_1",
    amount: 25,
    currency: "USD",
    status: "succeeded",
  }));
  const event = manager.parseWebhookEvent("local", {
    rawBody: raw,
    headers: { "x-signature": "valid", "x-webhook-timestamp": String(Date.now()) },
  });
  await manager.processWebhookEvent(event);
  assert.strictEqual(event.provider, "local");
  assert.strictEqual(store.confirmed.length, 1);
  assert.strictEqual(store.confirmed[0].details.gateway, "local");
}

async function testPaymentFailureAndRefund() {
  const store = {
    stripeEvent: {
      id: "evt_failed",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_failed", last_payment_error: { message: "declined" } } },
    },
    orders: {
      order_1: { _id: "order_1", amount: 25, currency: "USD", status: "pending", paymentStatus: "pending", gatewayCheckoutId: "pi_failed" },
    },
  };
  const manager = loadManager(store);
  let event = manager.parseWebhookEvent("stripe", { rawBody: Buffer.from("{}"), headers: { "stripe-signature": "valid" } });
  await manager.processWebhookEvent(event);
  assert.strictEqual(store.orders.order_1.paymentStatus, "failed");

  event = {
    provider: "stripe",
    eventId: "evt_refund",
    eventType: "charge.refunded",
    action: "payment.refunded",
    orderId: "order_1",
    transactionId: "pi_failed",
    amount: 25,
    currency: "USD",
    raw: {},
  };
  await manager.processWebhookEvent(event);
  assert.strictEqual(store.orders.order_1.paymentStatus, "refunded");
}

function testProviderRegistryFutureProviders() {
  const manager = loadManager();
  const providers = manager.registry.list();
  assert.ok(providers.includes("stripe"));
  assert.ok(providers.includes("local"));
  assert.ok(providers.includes("paypal"));
  assert.ok(providers.includes("lemon_squeezy"));
  assert.ok(providers.includes("paddle"));
}

async function run() {
  const tests = [
    testStripeCheckout,
    testStripeWebhookCompletesOrder,
    testDuplicateWebhookSkipped,
    testLocalPspCallback,
    testPaymentFailureAndRefund,
    testProviderRegistryFutureProviders,
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
