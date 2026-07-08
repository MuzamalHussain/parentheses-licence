const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase12c_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase12c_test_refresh_secret_with_enough_entropy";

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

function makeQuery(items) {
  return {
    sort() { return this; },
    skip() { return this; },
    limit(value) { return Promise.resolve(items.slice(0, value)); },
    lean: async () => items,
    then(resolve, reject) { return Promise.resolve(items).then(resolve, reject); },
  };
}

function makeDoc(data) {
  return {
    ...data,
    async save() { return this; },
  };
}

function loadWebhooksWithMocks() {
  const store = { endpoints: [], deliveries: [], audits: [], nextEndpoint: 1, nextDelivery: 1 };
  [
    "src/models/WebhookEndpoint.js",
    "src/models/OutgoingWebhook.js",
    "src/utils/auditLog.js",
    "src/services/webhooks/WebhookRegistry.js",
    "src/services/webhooks/WebhookSignatureService.js",
    "src/services/webhooks/WebhookSecurity.js",
    "src/services/webhooks/WebhookDeliveryService.js",
    "src/services/webhooks/WebhookRetryService.js",
    "src/services/webhooks/WebhookDispatcher.js",
    "src/services/webhooks/WebhookManager.js",
  ].forEach(clearModule);

  const WEBHOOK_EVENTS = [
    "UserRegistered", "UserUpdated", "UserDeleted", "OrderCreated", "OrderCompleted",
    "PaymentSucceeded", "PaymentFailed", "PaymentRefunded", "LicenseCreated", "LicenseActivated",
    "LicenseDeactivated", "LicenseRenewed", "LicenseExpired", "VersionReleased", "DownloadCompleted",
    "SupportTicketCreated", "SupportTicketUpdated",
  ];

  const WebhookEndpoint = {
    WEBHOOK_EVENTS,
    async create(data) {
      const doc = makeDoc({ _id: `endpoint_${store.nextEndpoint++}`, ...data, createdAt: new Date(), updatedAt: new Date() });
      store.endpoints.push(doc);
      return doc;
    },
    find(filter = {}) {
      let rows = [...store.endpoints];
      if (filter.enabled !== undefined) rows = rows.filter((row) => row.enabled === filter.enabled);
      if (filter.subscribedEvents) rows = rows.filter((row) => row.subscribedEvents.includes(filter.subscribedEvents));
      return makeQuery(rows);
    },
    async findByIdAndUpdate(id, patch) {
      const row = store.endpoints.find((item) => item._id === id);
      if (!row) return null;
      Object.assign(row, patch.$set || patch);
      return row;
    },
  };

  const OutgoingWebhook = {
    async create(data) {
      const doc = makeDoc({ _id: `delivery_${store.nextDelivery++}`, attempts: 0, responseStatus: 0, ...data, createdAt: new Date(), updatedAt: new Date() });
      store.deliveries.push(doc);
      return doc;
    },
    find(filter = {}) {
      let rows = [...store.deliveries];
      if (filter.status) {
        rows = filter.status.$in ? rows.filter((row) => filter.status.$in.includes(row.status)) : rows.filter((row) => row.status === filter.status);
      }
      if (filter.nextAttemptAt?.$lte) rows = rows.filter((row) => row.nextAttemptAt <= filter.nextAttemptAt.$lte);
      return makeQuery(rows);
    },
    async findById(id) {
      return store.deliveries.find((item) => item._id === id) || null;
    },
    async updateOne(filter, update) {
      const row = store.deliveries.find((item) => item._id === filter._id);
      if (row) Object.assign(row, update.$set || update);
      return { modifiedCount: row ? 1 : 0 };
    },
    async countDocuments() {
      return store.deliveries.length;
    },
    aggregate() {
      const counts = store.deliveries.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      return Promise.resolve(Object.entries(counts).map(([_id, count]) => ({ _id, count })));
    },
  };

  setMock("src/models/WebhookEndpoint.js", WebhookEndpoint);
  setMock("src/models/OutgoingWebhook.js", OutgoingWebhook);
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    Manager: require(path.join(root, "src/services/webhooks/WebhookManager.js")),
    Dispatcher: require(path.join(root, "src/services/webhooks/WebhookDispatcher.js")),
    Delivery: require(path.join(root, "src/services/webhooks/WebhookDeliveryService.js")),
    Retry: require(path.join(root, "src/services/webhooks/WebhookRetryService.js")),
    Signature: require(path.join(root, "src/services/webhooks/WebhookSignatureService.js")),
    Security: require(path.join(root, "src/services/webhooks/WebhookSecurity.js")),
  };
}

async function testWebhookCreationAndSecurityValidation() {
  const { Manager, Security, store } = loadWebhooksWithMocks();
  const created = await Manager.createEndpoint({
    name: "Orders",
    targetUrl: "https://example.com/webhook",
    subscribedEvents: ["OrderCompleted"],
    actor: { role: "admin" },
  });
  assert.strictEqual(created.endpoint.name, "Orders");
  assert.ok(created.secret.startsWith("whsec_"));
  assert.ok(store.audits.some((entry) => entry.action === "webhook.created"));
  assert.strictEqual(Security.validateDestinationUrl("http://127.0.0.1/hook").valid, false);
}

function testSignatureGenerationAndVerification() {
  const { Signature } = loadWebhooksWithMocks();
  const envelope = { id: "evt_1", event: "OrderCompleted", payload: { orderId: "ord_1" } };
  const signed = Signature.signEnvelope("super_secret", envelope, 1_800_000_000);
  assert.ok(signed.signature.includes("v1="));
  assert.strictEqual(Signature.verifySignature({ secret: "super_secret", envelope, timestamp: 1_800_000_000, signature: signed.signature, toleranceSeconds: 999_999_999 }), true);
}

async function testDeliverySuccessAndFailureHandling() {
  const { Manager, Dispatcher, Delivery, Retry, store } = loadWebhooksWithMocks();
  await Manager.createEndpoint({ name: "Orders", targetUrl: "https://example.com/webhook", secret: "super_secret_value", subscribedEvents: ["OrderCompleted"] });
  const queued = await Dispatcher.dispatch("OrderCompleted", { orderId: "ord_1" });
  assert.strictEqual(queued.dispatched, 1);

  const ok = await Delivery.deliver(store.deliveries[0], {
    httpClient: { post: async () => ({ status: 200, data: { ok: true } }) },
  });
  assert.strictEqual(ok.success, true);
  assert.strictEqual(store.deliveries[0].status, "sent");

  const failedRecord = await Dispatcher.queueForEndpoint(store.endpoints[0], "OrderCompleted", { orderId: "ord_2" }, { secret: "super_secret_value" });
  const failed = await Delivery.deliver(failedRecord, {
    httpClient: { post: async () => ({ status: 500, data: "nope" }) },
  });
  assert.strictEqual(failed.success, false);
  await Retry.scheduleRetry(failedRecord);
  assert.strictEqual(failedRecord.status, "retrying");
}

async function testDeadLetterQueue() {
  const { Retry, store } = loadWebhooksWithMocks();
  const record = makeDoc({ _id: "delivery_dead", attempts: 4, maxAttempts: 4, status: "failed", eventId: "evt_dead" });
  store.deliveries.push(record);
  const result = await Retry.scheduleRetry(record);
  assert.strictEqual(result.deadLetter, true);
  assert.strictEqual(record.status, "dead_letter");
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testWebhookCreationAndSecurityValidation,
    testSignatureGenerationAndVerification,
    testDeliverySuccessAndFailureHandling,
    testDeadLetterQueue,
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
