const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function createWebhookEventMock() {
  const events = new Map();

  function keyFor(query) {
    return `${query.gateway}:${query.eventId}`;
  }

  function matchesClaim(doc, query) {
    if (!doc || doc.gateway !== query.gateway || doc.eventId !== query.eventId) return false;
    if (!query.$or) return true;
    return query.$or.some((condition) => {
      if (condition.status === "failed") return doc.status === "failed";
      if (condition.status === "processing") {
        const cutoff = condition.updatedAt.$lt;
        return doc.status === "processing" && doc.updatedAt < cutoff;
      }
      return false;
    });
  }

  return {
    events,
    async create(doc) {
      const key = `${doc.gateway}:${doc.eventId}`;
      if (events.has(key)) {
        const err = new Error("duplicate key");
        err.code = 11000;
        throw err;
      }
      events.set(key, { ...doc, createdAt: new Date(), updatedAt: new Date() });
      return events.get(key);
    },
    async findOneAndUpdate(query, update) {
      const key = keyFor(query);
      const doc = events.get(key);
      if (!matchesClaim(doc, query)) return null;
      const next = { ...doc, ...update, updatedAt: new Date() };
      events.set(key, next);
      return next;
    },
    findOne(query) {
      const doc = events.get(keyFor(query));
      return { lean: async () => (doc ? { ...doc } : null) };
    },
    async updateOne(query, update) {
      const key = keyFor(query);
      const doc = events.get(key);
      if (!doc) return { modifiedCount: 0 };
      events.set(key, { ...doc, ...update, updatedAt: new Date() });
      return { modifiedCount: 1 };
    },
  };
}

function loadWebhookGuardWithMock(mock) {
  clearModule("src/utils/webhookGuard.js");
  const modelPath = clearModule("src/models/WebhookEvent.js");
  require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: mock };
  return require(path.join(root, "src/utils/webhookGuard.js"));
}

function loadStripeController({ event, guard, confirmOrderPaid }) {
  clearModule("src/controllers/stripeWebhookController.js");

  const stripeServicePath = clearModule("src/services/stripeService.js");
  require.cache[stripeServicePath] = {
    id: stripeServicePath,
    filename: stripeServicePath,
    loaded: true,
    exports: {
      constructWebhookEvent: (_body, signature) => {
        if (signature !== "valid") throw new Error("bad signature");
        return event;
      },
    },
  };

  const paymentServicePath = clearModule("src/services/paymentService.js");
  require.cache[paymentServicePath] = {
    id: paymentServicePath,
    filename: paymentServicePath,
    loaded: true,
    exports: { confirmOrderPaid },
  };

  const guardPath = clearModule("src/utils/webhookGuard.js");
  require.cache[guardPath] = {
    id: guardPath,
    filename: guardPath,
    loaded: true,
    exports: guard,
  };

  const orderPath = clearModule("src/models/Order.js");
  require.cache[orderPath] = {
    id: orderPath,
    filename: orderPath,
    loaded: true,
    exports: { updateOne: async () => ({ modifiedCount: 1 }) },
  };

  return require(path.join(root, "src/controllers/stripeWebhookController.js"));
}

function createReq(signature = "valid") {
  return { headers: { "stripe-signature": signature }, body: Buffer.from("{}") };
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

async function testSuccessfulSingleProcessing() {
  const mock = createWebhookEventMock();
  const guard = loadWebhookGuardWithMock(mock);

  const claim = await guard.beginWebhookProcessing({
    gateway: "stripe",
    eventId: "evt_single",
    eventType: "checkout.session.completed",
    payload: {},
  });
  assert.strictEqual(claim.shouldProcess, true);

  await guard.markWebhookProcessed("stripe", "evt_single");
  const stored = mock.events.get("stripe:evt_single");
  assert.strictEqual(stored.status, "processed");
  assert.strictEqual(stored.processed, true);
  assert.ok(stored.processedAt instanceof Date);
}

async function testDuplicateWebhookDeliverySkipsBusinessLogic() {
  const event = {
    id: "evt_duplicate",
    type: "checkout.session.completed",
    data: {
      object: {
        metadata: { orderId: "order_1" },
        payment_intent: "pi_1",
        amount_total: 2500,
        currency: "usd",
      },
    },
  };
  let businessCalls = 0;
  let guardCalls = 0;
  const { handleStripeWebhook } = loadStripeController({
    event,
    confirmOrderPaid: async () => {
      businessCalls += 1;
    },
    guard: {
      beginWebhookProcessing: async () => {
        guardCalls += 1;
        return guardCalls === 1
          ? { shouldProcess: true, status: "processing", attempt: "created" }
          : { shouldProcess: false, status: "processed", attempt: "duplicate" };
      },
      markWebhookProcessed: async () => {},
      markWebhookFailed: async () => {},
    },
  });

  const first = createRes();
  const second = createRes();
  await handleStripeWebhook(createReq(), first);
  await handleStripeWebhook(createReq(), second);

  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(second.statusCode, 200);
  assert.strictEqual(second.body.duplicate, true);
  assert.strictEqual(businessCalls, 1);
}

async function testStripeRetryDeliveryAfterProcessedSkipsBusinessLogic() {
  const mock = createWebhookEventMock();
  const guard = loadWebhookGuardWithMock(mock);

  await guard.beginWebhookProcessing({
    gateway: "stripe",
    eventId: "evt_retry_processed",
    eventType: "checkout.session.completed",
    payload: {},
  });
  await guard.markWebhookProcessed("stripe", "evt_retry_processed");

  const retry = await guard.beginWebhookProcessing({
    gateway: "stripe",
    eventId: "evt_retry_processed",
    eventType: "checkout.session.completed",
    payload: {},
  });

  assert.strictEqual(retry.shouldProcess, false);
  assert.strictEqual(retry.status, "processed");
}

async function testProcessingFailureThenRetry() {
  const mock = createWebhookEventMock();
  const guard = loadWebhookGuardWithMock(mock);

  await guard.beginWebhookProcessing({
    gateway: "stripe",
    eventId: "evt_retry_failed",
    eventType: "checkout.session.completed",
    payload: {},
  });
  await guard.markWebhookFailed("stripe", "evt_retry_failed", "temporary database error");

  const retry = await guard.beginWebhookProcessing({
    gateway: "stripe",
    eventId: "evt_retry_failed",
    eventType: "checkout.session.completed",
    payload: {},
  });

  assert.strictEqual(retry.shouldProcess, true);
  assert.strictEqual(retry.attempt, "retry");
  assert.strictEqual(mock.events.get("stripe:evt_retry_failed").status, "processing");
}

async function testConcurrentDuplicateRequests() {
  const mock = createWebhookEventMock();
  const guard = loadWebhookGuardWithMock(mock);

  const [first, second] = await Promise.all([
    guard.beginWebhookProcessing({
      gateway: "stripe",
      eventId: "evt_concurrent",
      eventType: "checkout.session.completed",
      payload: {},
    }),
    guard.beginWebhookProcessing({
      gateway: "stripe",
      eventId: "evt_concurrent",
      eventType: "checkout.session.completed",
      payload: {},
    }),
  ]);

  assert.strictEqual([first.shouldProcess, second.shouldProcess].filter(Boolean).length, 1);
  assert.strictEqual(mock.events.size, 1);
}

async function testSignatureVerificationStillBlocksBeforeProcessing() {
  const event = { id: "evt_bad_sig", type: "checkout.session.completed", data: { object: {} } };
  let guardCalls = 0;
  let businessCalls = 0;
  const { handleStripeWebhook } = loadStripeController({
    event,
    confirmOrderPaid: async () => {
      businessCalls += 1;
    },
    guard: {
      beginWebhookProcessing: async () => {
        guardCalls += 1;
        return { shouldProcess: true, status: "processing", attempt: "created" };
      },
      markWebhookProcessed: async () => {},
      markWebhookFailed: async () => {},
    },
  });

  const res = createRes();
  await handleStripeWebhook(createReq("invalid"), res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(guardCalls, 0);
  assert.strictEqual(businessCalls, 0);
}

async function run() {
  const tests = [
    testSuccessfulSingleProcessing,
    testDuplicateWebhookDeliverySkipsBusinessLogic,
    testStripeRetryDeliveryAfterProcessedSkipsBusinessLogic,
    testProcessingFailureThenRetry,
    testConcurrentDuplicateRequests,
    testSignatureVerificationStillBlocksBeforeProcessing,
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
