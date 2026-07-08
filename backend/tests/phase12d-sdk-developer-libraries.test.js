const assert = require("assert");
const path = require("path");

const sdkPath = path.resolve(__dirname, "../../sdk/javascript/src");
const {
  ParenthesesLicenceClient,
  AuthenticationError,
  RateLimitError,
  ServerError,
} = require(sdkPath);

function makeResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      forEach(callback) {
        Object.entries(headers).forEach(([key, value]) => callback(value, key));
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function makeClient(responses, calls, options = {}) {
  return new ParenthesesLicenceClient({
    apiKey: "pk_test_123",
    baseUrl: "https://licence.example.test",
    maxRetries: options.maxRetries ?? 0,
    sleep: async () => {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      return typeof next === "function" ? next(url, init) : next;
    },
  });
}

async function testAuthenticationHeadersAndRequestHandling() {
  const calls = [];
  const client = makeClient([
    makeResponse(200, { success: true, data: [{ name: "Plugin" }], pagination: { page: 1, limit: 1, total: 1, pages: 1 } }),
  ], calls);
  const page = await client.products.list({ limit: 1 });
  assert.strictEqual(page.data[0].name, "Plugin");
  assert.ok(calls[0].url.includes("/api/public/v1/products?limit=1"));
  assert.strictEqual(calls[0].init.headers.Authorization, "Bearer pk_test_123");
  assert.strictEqual(calls[0].init.headers["X-Parentheses-API-Version"], "v1");
}

async function testPaginationHelpers() {
  const calls = [];
  const client = makeClient([
    makeResponse(200, { success: true, data: ["a"], pagination: { page: 1, limit: 1, total: 2, pages: 2 } }),
    makeResponse(200, { success: true, data: ["b"], pagination: { page: 2, limit: 1, total: 2, pages: 2 } }),
  ], calls);
  const first = await client.products.list({ limit: 1 });
  assert.strictEqual(first.hasNextPage(), true);
  const second = await first.nextPage();
  assert.deepStrictEqual(second.data, ["b"]);
  const values = [];
  for await (const item of second.autoPagination()) values.push(item);
  assert.deepStrictEqual(values, ["b"]);
}

async function testTypedErrors() {
  const authClient = makeClient([
    makeResponse(401, { success: false, error: { code: "API_KEY_INVALID", message: "Invalid key." }, requestId: "req_1" }),
  ], []);
  await assert.rejects(() => authClient.validateKey(), AuthenticationError);

  const rateClient = makeClient([
    makeResponse(429, { success: false, error: { code: "RATE_LIMITED", message: "Slow down." } }, { "Retry-After": "3" }),
  ], []);
  await assert.rejects(() => rateClient.products.list(), (err) => err instanceof RateLimitError && err.retryAfter === 3);
}

async function testRetryHandlingAndCompatibility() {
  const calls = [];
  const client = makeClient([
    makeResponse(500, { success: false, error: { code: "SERVER_ERROR", message: "Try again." } }),
    makeResponse(200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
  ], calls, { maxRetries: 1 });
  const page = await client.orders.list();
  assert.deepStrictEqual(page.data, []);
  assert.strictEqual(calls.length, 2);
  assert.ok(client.compatibility.supports.includes("webhooks"));
}

async function testRetryExhaustion() {
  const client = makeClient([
    makeResponse(500, { success: false, error: { code: "SERVER_ERROR", message: "Still broken." } }),
  ], [], { maxRetries: 0 });
  await assert.rejects(() => client.downloads.list(), ServerError);
}

async function run() {
  const tests = [
    testAuthenticationHeadersAndRequestHandling,
    testPaginationHelpers,
    testTypedErrors,
    testRetryHandlingAndCompatibility,
    testRetryExhaustion,
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
