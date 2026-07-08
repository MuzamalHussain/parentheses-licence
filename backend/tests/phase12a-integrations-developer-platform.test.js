const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase12a_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase12a_test_refresh_secret_with_enough_entropy";

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

function makeDoc(data) {
  return {
    ...data,
    async save() {
      return this;
    },
  };
}

function loadIntegrationsWithMocks() {
  const store = {
    integrations: [],
    webhooks: [],
    audits: [],
  };

  [
    "src/models/Integration.js",
    "src/models/OutgoingWebhook.js",
    "src/utils/auditLog.js",
    "src/services/integrations/IntegrationProviderInterface.js",
    "src/services/integrations/providers/PlaceholderIntegrationProvider.js",
    "src/services/integrations/IntegrationRegistry.js",
    "src/services/integrations/IntegrationHealthService.js",
    "src/services/integrations/OutgoingWebhookService.js",
    "src/services/integrations/ExtensionBus.js",
    "src/services/integrations/ApiCapabilityRegistry.js",
    "src/services/integrations/IntegrationManager.js",
  ].forEach(clearModule);

  const Integration = {
    find(filter = {}) {
      let rows = [...store.integrations];
      if (filter.enabled !== undefined) rows = rows.filter((row) => row.enabled === filter.enabled);
      if (filter.providerId) rows = rows.filter((row) => row.providerId === filter.providerId);
      if (filter.status?.$in) rows = rows.filter((row) => filter.status.$in.includes(row.status));
      if (filter["configuration.webhookEvents"]) {
        rows = rows.filter((row) => (row.configuration?.webhookEvents || []).includes(filter["configuration.webhookEvents"]));
      }
      return { lean: async () => rows.map((row) => ({ ...row })) };
    },
    findOne(filter = {}) {
      const row = store.integrations.find((item) => item.providerId === filter.providerId) || null;
      return {
        lean: async () => (row ? { ...row } : null),
        then: (resolve) => Promise.resolve(row ? makeDoc(row) : null).then(resolve),
      };
    },
    async findOneAndUpdate(filter, update) {
      let row = store.integrations.find((item) => item.providerId === filter.providerId);
      if (!row) {
        row = { _id: `int_${store.integrations.length + 1}`, providerId: filter.providerId, configuration: {}, enabled: false };
        store.integrations.push(row);
      }
      Object.assign(row, update.$setOnInsert || {}, update.$set || {});
      return makeDoc(row);
    },
  };

  const OutgoingWebhook = {
    async create(data) {
      const record = { _id: `wh_${store.webhooks.length + 1}`, ...data };
      store.webhooks.push(record);
      return record;
    },
  };

  setMock("src/models/Integration.js", Integration);
  setMock("src/models/OutgoingWebhook.js", OutgoingWebhook);
  setMock("src/utils/auditLog.js", {
    writeAuditLog: async (entry) => store.audits.push(entry),
  });

  return {
    store,
    Manager: require(path.join(root, "src/services/integrations/IntegrationManager.js")),
    Registry: require(path.join(root, "src/services/integrations/IntegrationRegistry.js")),
    Webhooks: require(path.join(root, "src/services/integrations/OutgoingWebhookService.js")),
    Api: require(path.join(root, "src/services/integrations/ApiCapabilityRegistry.js")),
    ExtensionBus: require(path.join(root, "src/services/integrations/ExtensionBus.js")),
  };
}

function testRegistryAndProviderLoading() {
  const { Registry } = loadIntegrationsWithMocks();
  const providers = Registry.list();
  assert.ok(providers.some((provider) => provider.id === "github"));
  assert.ok(providers.some((provider) => provider.id === "slack"));
  assert.ok(providers.some((provider) => provider.id === "zapier"));
}

async function testProviderConfigurationAndHealth() {
  const { Manager, store } = loadIntegrationsWithMocks();
  const integration = await Manager.configure("slack", {
    webhookUrl: "https://hooks.example.test/slack",
    signingSecret: "super_secret_value",
    webhookEvents: ["OrderCompleted"],
  }, { actor: { role: "admin" } });
  assert.strictEqual(integration.providerId, "slack");
  assert.strictEqual(store.audits[0].action, "integration.configuration_changed");

  await Manager.setEnabled("slack", true, { actor: { role: "admin" } });
  const result = await Manager.testConnection("slack", { actor: { role: "admin" } });
  assert.strictEqual(result.success, true);
  const health = await Manager.health.getHealth("slack");
  assert.strictEqual(health.providerId, "slack");
  assert.strictEqual(health.version, "0.1.0");
}

async function testWebhookDispatchAndSignature() {
  const { Manager, Webhooks, store } = loadIntegrationsWithMocks();
  await Manager.configure("zapier", {
    webhookUrl: "https://hooks.example.test/zapier",
    signingSecret: "super_secret_value",
    webhookEvents: ["OrderCompleted"],
  });
  await Manager.setEnabled("zapier", true);
  store.integrations[0].status = "connected";

  const result = await Webhooks.dispatch("OrderCompleted", { orderId: "ord_1" }, { actor: { role: "admin" } });
  assert.strictEqual(result.dispatched, 1);
  assert.strictEqual(store.webhooks[0].status, "pending");
  assert.ok(store.webhooks[0].signature.length > 10);
  assert.ok(store.audits.some((entry) => entry.action === "integration.webhook_queued"));
}

function testApiCapabilitiesAndExtensions() {
  const { Api, ExtensionBus } = loadIntegrationsWithMocks();
  const metadata = Api.getDocumentationMetadata();
  assert.strictEqual(metadata.current, "v1");
  assert.ok(metadata.capabilities.some((capability) => capability.key === "webhooks.outgoing"));

  ExtensionBus.registerExtension({ id: "sample", version: "0.1.0" });
  let called = false;
  ExtensionBus.on("OrderCompleted", async () => {
    called = true;
  });
  return ExtensionBus.emit("OrderCompleted", {}).then(() => {
    assert.strictEqual(called, true);
    assert.ok(ExtensionBus.listExtensions().some((extension) => extension.id === "sample"));
  });
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testRegistryAndProviderLoading,
    testProviderConfigurationAndHealth,
    testWebhookDispatchAndSignature,
    testApiCapabilitiesAndExtensions,
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
