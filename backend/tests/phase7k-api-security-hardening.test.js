const assert = require("assert");
const http = require("http");
const path = require("path");
const { z } = require("zod");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase7k_test_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase7k_test_refresh_secret";
process.env.API_WEBHOOK_BODY_LIMIT = "32b";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function mockAuditLog() {
  const resolved = clearModule("src/utils/auditLog.js");
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: {
      writeAuditLog: async () => {},
    },
  };
}

async function withServer(test) {
  mockAuditLog();
  clearModule("src/app.js");
  clearModule("src/middleware/apiSecurity.js");
  clearModule("src/config/apiSecurity.js");
  const app = require(path.join(root, "src/app.js"));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await test(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testApiVersionDiscoveryAndRequestId() {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api`, { headers: { "X-Request-Id": "phase7k-request" } });
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("x-request-id"), "phase7k-request");
    assert.deepStrictEqual(body.versions, ["v1"]);
    assert.strictEqual(body.current, "v1");
  });
}

async function testInvalidJsonReturnsConsistentJsonError() {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    const body = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, "Invalid JSON payload.");
    assert.ok(body.requestId);
    assert.strictEqual(body.stack, undefined);
  });
}

async function testJsonContentTypeRequiredForBodyRequests() {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "email=a@example.test",
    });
    const body = await res.json();

    assert.strictEqual(res.status, 415);
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Content-Type/);
    assert.ok(body.requestId);
  });
}

async function testOversizedWebhookPayloadRejectedBeforeController() {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/webhooks/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Timestamp": String(Date.now()) },
      body: JSON.stringify({ payload: "this body is deliberately larger than thirty two bytes" }),
    });
    const body = await res.json();

    assert.strictEqual(res.status, 413);
    assert.strictEqual(body.message, "Request payload is too large.");
    assert.ok(body.requestId);
  });
}

async function testLocalWebhookTimestampValidation() {
  mockAuditLog();
  clearModule("src/controllers/localPspWebhookController.js");
  const controller = require(path.join(root, "src/controllers/localPspWebhookController.js"));
  const { validateWebhookTimestamp } = controller._private;

  assert.strictEqual(validateWebhookTimestamp(String(Date.now())), true);
  assert.strictEqual(validateWebhookTimestamp(String(Math.floor(Date.now() / 1000))), true);
  assert.strictEqual(validateWebhookTimestamp(String(Date.now() - 10 * 60 * 1000)), false);
  assert.strictEqual(validateWebhookTimestamp("not-a-time"), false);
}

async function testValidateRequestCoversParamsQueryHeaders() {
  const { validateRequest } = require(path.join(root, "src/validators/schemas.js"));
  const middleware = validateRequest({
    params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }),
    query: z.object({ page: z.coerce.number().int().positive() }),
    headers: z.object({ "x-test": z.string().min(1) }).passthrough(),
  });

  const req = {
    params: { id: "not-valid" },
    query: { page: "1" },
    headers: { "x-test": "ok" },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  middleware(req, res, () => {});
  assert.strictEqual(res.statusCode, 422);
  assert.match(res.body.message, /params.id/);
}

async function run() {
  const tests = [
    testApiVersionDiscoveryAndRequestId,
    testInvalidJsonReturnsConsistentJsonError,
    testJsonContentTypeRequiredForBodyRequests,
    testOversizedWebhookPayloadRejectedBeforeController,
    testLocalWebhookTimestampValidation,
    testValidateRequestCoversParamsQueryHeaders,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit(0));
