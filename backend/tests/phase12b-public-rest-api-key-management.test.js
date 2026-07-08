const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase12b_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase12b_test_refresh_secret_with_enough_entropy";

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

function chain(value) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function makeDoc(data) {
  return {
    ...data,
    async save() {
      return this;
    },
  };
}

function loadApiKeyWithMocks() {
  const store = { keys: [], audits: [], nextId: 1 };
  [
    "src/models/ApiKey.js",
    "src/utils/auditLog.js",
    "src/services/publicApi/ApiKeyService.js",
    "src/services/publicApi/OpenApiService.js",
    "src/middleware/publicApiAuth.js",
    "src/middleware/publicApiRateLimit.js",
  ].forEach(clearModule);

  const ApiKey = {
    API_KEY_SCOPES: [
      "products.read", "products.write", "licenses.read", "licenses.write", "orders.read", "orders.write",
      "downloads.read", "customers.read", "analytics.read", "webhooks.write", "admin",
    ],
    async create(data) {
      const doc = makeDoc({ _id: `key_${store.nextId++}`, status: "active", usageCount: 0, ...data });
      store.keys.push(doc);
      return doc;
    },
    find(filter = {}) {
      let rows = [...store.keys];
      if (filter.ownerId) rows = rows.filter((key) => key.ownerId === filter.ownerId);
      return chain(rows.map(({ keyHash, ...safe }) => safe));
    },
    findOne(filter = {}) {
      const row = store.keys.find((key) => key.keyHash === filter.keyHash || key._id === filter._id) || null;
      return chain(row);
    },
    findById(id) {
      const row = store.keys.find((key) => key._id === id) || null;
      return chain(row);
    },
    findByIdAndUpdate(id, update) {
      const row = store.keys.find((key) => key._id === id) || null;
      if (row) Object.assign(row, update);
      const { keyHash, ...safe } = row || {};
      return chain(row ? safe : null);
    },
  };

  setMock("src/models/ApiKey.js", ApiKey);
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    ApiKeyService: require(path.join(root, "src/services/publicApi/ApiKeyService.js")),
    OpenApiService: require(path.join(root, "src/services/publicApi/OpenApiService.js")),
    publicAuth: require(path.join(root, "src/middleware/publicApiAuth.js")),
    rateLimit: require(path.join(root, "src/middleware/publicApiRateLimit.js")),
  };
}

async function testApiKeyCreationAndAuthentication() {
  const { ApiKeyService, store } = loadApiKeyWithMocks();
  const created = await ApiKeyService.createKey({
    name: "Test key",
    ownerId: "user_1",
    scopes: ["products.read", "licenses.write"],
    accessType: "read_only",
    actor: { role: "admin" },
  });
  assert.ok(created.rawKey.startsWith("pl_live_"));
  assert.notStrictEqual(store.keys[0].keyHash, created.rawKey);
  assert.deepStrictEqual(store.keys[0].scopes, ["products.read"]);

  const auth = await ApiKeyService.authenticate(created.rawKey, { ip: "127.0.0.1" });
  assert.strictEqual(auth.ok, true);
  assert.strictEqual(auth.apiKey.usageCount, 1);
  assert.ok(store.audits.some((entry) => entry.action === "api_key.created"));
}

async function testRotationAndRevocation() {
  const { ApiKeyService, store } = loadApiKeyWithMocks();
  const created = await ApiKeyService.createKey({ name: "Rotate me", ownerId: "user_1", scopes: ["products.read"] });
  const rotated = await ApiKeyService.rotateKey(created.apiKey._id, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(store.keys[0].status, "revoked");
  assert.ok(rotated.rawKey.startsWith("pl_live_"));
  assert.ok(store.audits.some((entry) => entry.action === "api_key.rotated"));

  const revoked = await ApiKeyService.revokeKey(rotated.apiKey._id, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(revoked.status, "revoked");
  assert.ok(store.audits.some((entry) => entry.action === "api_key.revoked"));
}

function mockReqRes({ apiKey, headers = {}, method = "GET", path = "/products" } = {}) {
  const req = {
    id: "req_1",
    ip: "127.0.0.1",
    method,
    path,
    route: { path },
    apiKey,
    headers,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { req, res };
}

function testScopesAndPermissions() {
  const { publicAuth } = loadApiKeyWithMocks();
  const { req, res } = mockReqRes({ apiKey: { scopes: ["products.read"] } });
  let called = false;
  publicAuth.requireScope("products.read")(req, res, () => { called = true; });
  assert.strictEqual(called, true);

  const denied = mockReqRes({ apiKey: { scopes: ["products.read"] } });
  publicAuth.requireScope("licenses.write")(denied.req, denied.res, () => {});
  assert.strictEqual(denied.res.statusCode, 403);
  assert.strictEqual(denied.res.body.error.code, "SCOPE_REQUIRED");
}

function testRateLimitingAndReplayProtection() {
  const { rateLimit } = loadApiKeyWithMocks();
  rateLimit.resetPublicApiRateLimitForTests();
  const apiKey = { _id: "key_rate", rateLimits: { perMinute: 2, burst: 2, daily: 10 } };

  for (let i = 0; i < 2; i += 1) {
    const { req, res } = mockReqRes({ apiKey });
    let called = false;
    rateLimit.publicApiRateLimit(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  }

  const third = mockReqRes({ apiKey });
  rateLimit.publicApiRateLimit(third.req, third.res, () => {});
  assert.strictEqual(third.res.statusCode, 429);

  const write = mockReqRes({ apiKey, method: "POST", headers: { "x-api-nonce": "nonce_1" } });
  rateLimit.preventReplay(write.req, write.res, () => {});
  const replay = mockReqRes({ apiKey, method: "POST", headers: { "x-api-nonce": "nonce_1" } });
  rateLimit.preventReplay(replay.req, replay.res, () => {});
  assert.strictEqual(replay.res.statusCode, 409);
}

function testOpenApiMetadata() {
  const { OpenApiService } = loadApiKeyWithMocks();
  const metadata = OpenApiService.getOpenApiMetadata();
  assert.strictEqual(metadata.openapi, "3.0.3");
  assert.ok(metadata.endpoints.some((endpoint) => endpoint.path === "/api/public/v1/products"));
  assert.ok(metadata.paths["/products"].get);
  assert.ok(metadata.scopes.includes("admin"));
}

async function run() {
  const tests = [
    testApiKeyCreationAndAuthentication,
    testRotationAndRevocation,
    testScopesAndPermissions,
    testRateLimitingAndReplayProtection,
    testOpenApiMetadata,
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
