const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase12f_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase12f_test_refresh_secret_with_enough_entropy";

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

function loadDeveloperPortalWithMocks() {
  [
    "src/models/ApiKey.js",
    "src/models/WebhookEndpoint.js",
    "src/utils/auditLog.js",
    "src/services/publicApi/ApiKeyService.js",
    "src/services/publicApi/OpenApiService.js",
    "src/services/webhooks/WebhookRegistry.js",
    "src/services/developerPortal/DeveloperPortalService.js",
  ].forEach(clearModule);

  const keys = new Map();

  setMock("src/models/ApiKey.js", {
    API_KEY_SCOPES: [
      "products.read", "products.write", "licenses.read", "licenses.write", "orders.read", "orders.write",
      "downloads.read", "customers.read", "analytics.read", "webhooks.write", "admin",
    ],
    async create(data) {
      const doc = { _id: `key_${keys.size + 1}`, ...data, usageCount: 0, async save() { return this; } };
      keys.set(data.keyHash, doc);
      return doc;
    },
    findOne(filter = {}) {
      const row = [...keys.values()].find((item) => item.keyHash === filter.keyHash) || null;
      return {
        select() { return this; },
        then(resolve, reject) { return Promise.resolve(row).then(resolve, reject); },
      };
    },
  });
  setMock("src/models/WebhookEndpoint.js", {
    WEBHOOK_EVENTS: ["OrderCompleted", "PaymentSucceeded", "LicenseCreated", "DownloadCompleted"],
  });
  setMock("src/utils/auditLog.js", { writeAuditLog: async () => {} });

  return {
    keys,
    ApiKeyService: require(path.join(root, "src/services/publicApi/ApiKeyService.js")),
    OpenApiService: require(path.join(root, "src/services/publicApi/OpenApiService.js")),
    Portal: require(path.join(root, "src/services/developerPortal/DeveloperPortalService.js")),
  };
}

function testDocumentationGeneration() {
  const { Portal } = loadDeveloperPortalWithMocks();
  const dashboard = Portal.dashboard();
  assert.ok(dashboard.docs.guides.some((guide) => guide.slug === "getting-started"));
  assert.ok(dashboard.docs.endpoints.some((endpoint) => endpoint.resource === "Products"));
  assert.ok(dashboard.docs.webhooks.some((event) => event.name === "OrderCompleted"));
  assert.ok(dashboard.sdks.some((sdk) => sdk.language === "JavaScript"));
}

function testOpenApiValidity() {
  const { OpenApiService } = loadDeveloperPortalWithMocks();
  const spec = OpenApiService.getOpenApiMetadata();
  assert.strictEqual(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/products"].get.operationId);
  assert.ok(spec.components.securitySchemes.bearerApiKey);
  assert.ok(spec.errorCodes.some((item) => item.code === "RATE_LIMITED"));
}

function testPostmanGenerationAndSearch() {
  const { Portal } = loadDeveloperPortalWithMocks();
  const collection = Portal.postmanCollection();
  const env = Portal.postmanEnvironment();
  const results = Portal.search("webhook");
  assert.strictEqual(collection.info.name, "Parentheses Licence Public API");
  assert.ok(collection.item.length > 0);
  assert.ok(env.values.some((item) => item.key === "api_key" && item.type === "secret"));
  assert.ok(results.some((item) => item.type === "webhook" || item.type === "guide"));
}

async function testSandboxAuthentication() {
  const { ApiKeyService, Portal } = loadDeveloperPortalWithMocks();
  const sandbox = await ApiKeyService.createKey({
    name: "Sandbox",
    ownerId: "user_1",
    environment: "sandbox",
    accessType: "read_only",
    scopes: ["products.read"],
  });
  const result = await Portal.sandboxExecute({ apiKey: sandbox.rawKey, endpointId: "listProducts", method: "GET" });
  assert.strictEqual(result.mock, true);
  assert.strictEqual(result.environment, "sandbox");

  const production = await ApiKeyService.createKey({
    name: "Production",
    ownerId: "user_1",
    environment: "production",
    accessType: "read_only",
    scopes: ["products.read"],
  });
  await assert.rejects(
    () => Portal.sandboxExecute({ apiKey: production.rawKey, endpointId: "listProducts", method: "GET" }),
    (err) => err.code === "SANDBOX_KEY_REQUIRED"
  );
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testDocumentationGeneration,
    testOpenApiValidity,
    testPostmanGenerationAndSearch,
    testSandboxAuthentication,
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
