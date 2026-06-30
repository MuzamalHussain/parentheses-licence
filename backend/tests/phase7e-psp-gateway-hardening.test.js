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
    populate() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function validConfig(overrides = {}) {
  return {
    payments: {
      stripeSecretKey: "sk_test_51_real_enough_for_readiness",
      stripeWebhookSecret: "whsec_real_enough_for_readiness",
      localPspBaseUrl: "https://payments.real-provider.test/api/v1",
      localPspMerchantId: "merchant_12345",
      localPspSecretKey: "psp_secret_12345",
    },
    features: {
      ENABLE_STRIPE: true,
      ENABLE_LOCAL_PSP: true,
    },
    app: {
      clientOrigins: ["http://localhost:5173"],
    },
    ...overrides,
  };
}

async function testStripeOperationalWithValidLookingConfig() {
  const { buildProviderStatus } = require(path.join(root, "src/services/paymentProviderStatus.js"));
  const status = buildProviderStatus("stripe", validConfig());

  assert.strictEqual(status.enabled, true);
  assert.strictEqual(status.configured, true);
  assert.strictEqual(status.operational, true);
  assert.strictEqual(status.label, "Operational");
}

async function testStripeBlockedWithMissingKey() {
  const { buildProviderStatus } = require(path.join(root, "src/services/paymentProviderStatus.js"));
  const status = buildProviderStatus("stripe", validConfig({
    payments: {
      stripeSecretKey: "",
      stripeWebhookSecret: "whsec_real_enough_for_readiness",
    },
  }));

  assert.strictEqual(status.configured, false);
  assert.strictEqual(status.operational, false);
  assert.strictEqual(status.reason, "Missing real credentials.");
}

async function testStripeBlockedWithDummyKey() {
  const { buildProviderStatus } = require(path.join(root, "src/services/paymentProviderStatus.js"));
  const status = buildProviderStatus("stripe", validConfig({
    payments: {
      stripeSecretKey: "sk_live_replace_me",
      stripeWebhookSecret: "whsec_real_enough_for_readiness",
    },
  }));

  assert.strictEqual(status.configured, false);
  assert.strictEqual(status.operational, false);
  assert.strictEqual(status.reason, "Dummy or placeholder credentials detected.");
}

async function testLocalPspBlockedWithDummyCredentials() {
  const { buildProviderStatus } = require(path.join(root, "src/services/paymentProviderStatus.js"));
  const status = buildProviderStatus("local", validConfig({
    payments: {
      localPspBaseUrl: "https://sandbox.local-psp.example.com/api/v1",
      localPspMerchantId: "dummy_merchant_id",
      localPspSecretKey: "dummy_secret_key_replace_me",
    },
  }));

  assert.strictEqual(status.configured, false);
  assert.strictEqual(status.operational, false);
  assert.strictEqual(status.reason, "Provider adapter not implemented.");
}

async function testLocalPspBlockedWhenAdapterMissing() {
  const { buildProviderStatus } = require(path.join(root, "src/services/paymentProviderStatus.js"));
  const status = buildProviderStatus("local", validConfig());

  assert.strictEqual(status.configured, true);
  assert.strictEqual(status.adapterImplemented, false);
  assert.strictEqual(status.operational, false);
  assert.strictEqual(status.label, "Adapter Missing");
}

function loadOrderController({ providerOperational = true, gatewaySession = { id: "cs_test_123", url: "https://checkout.stripe.test/session" } } = {}) {
  clearModule("src/controllers/orderController.js");

  const orderStore = { created: [], saved: [] };
  const OrderMock = {
    async create(doc) {
      const order = {
        ...doc,
        _id: "order_1",
        async save() {
          orderStore.saved.push({ ...this });
          return this;
        },
      };
      orderStore.created.push(order);
      return order;
    },
    find() { return query([]); },
    countDocuments() { return query(0); },
    findOne() { return query(null); },
  };

  const mappings = [
    ["src/models/Order.js", OrderMock],
    ["src/models/Product.js", { findById: () => query({ _id: "product_1", name: "Parentheses" }) }],
    ["src/models/Plan.js", { findOne: () => query({ _id: "plan_1", productId: "product_1", isActive: true, priceUSD: 25, priceLocal: 7500 }) }],
    ["src/services/paymentService.js", { computeCheckoutAmount: async () => ({ amount: 25, discountAmount: 0, couponCode: "" }) }],
    ["src/services/stripeService.js", { createCheckoutSession: async () => gatewaySession }],
    ["src/services/localPspService.js", { createLocalCheckout: async () => ({ checkoutId: "local_1", checkoutUrl: "https://local.test" }) }],
    ["src/services/paymentProviderStatus.js", {
      assertProviderOperational: (provider) => {
        if (!providerOperational) {
          const err = new Error("Payment provider is not available: Missing real credentials.");
          err.statusCode = 503;
          throw err;
        }
        return { id: provider, operational: true };
      },
    }],
    ["src/config/env.js", { getConfig: () => ({ app: { clientOrigins: ["http://localhost:5173"] } }) }],
  ];

  for (const [relativePath, exports] of mappings) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  return {
    controller: require(path.join(root, "src/controllers/orderController.js")),
    orderStore,
  };
}

function createReq(gateway = "stripe") {
  return {
    body: { productId: "product_1", planId: "plan_1", gateway },
    user: { _id: "user_1", email: "ada@example.test", name: "Ada" },
  };
}

function createRes() {
  return {
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
}

async function callCheckout(controller, req) {
  const res = createRes();
  let nextError = null;
  await controller.createCheckout(req, res, (err) => {
    nextError = err;
  });
  return { res, nextError };
}

async function testCheckoutRejectsNonOperationalProvider() {
  const { controller, orderStore } = loadOrderController({ providerOperational: false });
  const { nextError } = await callCheckout(controller, createReq("local"));

  assert.ok(nextError);
  assert.strictEqual(nextError.statusCode, 503);
  assert.strictEqual(orderStore.created.length, 0);
}

async function testExistingStripeCheckoutStillWorksWhenConfigured() {
  const { controller, orderStore } = loadOrderController({ providerOperational: true });
  const { res, nextError } = await callCheckout(controller, createReq("stripe"));

  assert.strictEqual(nextError, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.checkoutUrl, "https://checkout.stripe.test/session");
  assert.strictEqual(orderStore.created.length, 1);
  assert.strictEqual(orderStore.saved.length, 1);
}

async function run() {
  const tests = [
    testStripeOperationalWithValidLookingConfig,
    testStripeBlockedWithMissingKey,
    testStripeBlockedWithDummyKey,
    testLocalPspBlockedWithDummyCredentials,
    testLocalPspBlockedWhenAdapterMissing,
    testCheckoutRejectsNonOperationalProvider,
    testExistingStripeCheckoutStillWorksWhenConfigured,
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
