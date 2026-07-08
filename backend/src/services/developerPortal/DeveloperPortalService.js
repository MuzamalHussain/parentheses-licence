const OpenApiService = require("../publicApi/OpenApiService");
const ApiKeyService = require("../publicApi/ApiKeyService");
const WebhookRegistry = require("../webhooks/WebhookRegistry");

const sdkCatalog = [
  { language: "JavaScript", package: "@parentheses/licence-sdk", status: "foundation", path: "sdk/javascript", runtime: "Browser/Node" },
  { language: "TypeScript", package: "@parentheses/licence-sdk", status: "types-ready", path: "sdk/javascript/src/index.d.ts", runtime: "Browser/Node" },
  { language: "Node.js", package: "@parentheses/licence-sdk", status: "foundation", path: "sdk/javascript", runtime: "Node 18+" },
  { language: "PHP", package: "Parentheses\\Licence", status: "foundation", path: "sdk/php", runtime: "PHP/WordPress" },
  { language: "Python", package: "planned", status: "planned", path: "", runtime: "Future" },
  { language: "Go", package: "planned", status: "planned", path: "", runtime: "Future" },
  { language: "C#", package: "planned", status: "planned", path: "", runtime: "Future" },
];

const guides = [
  { slug: "getting-started", title: "Getting Started", category: "Onboarding", body: "Create an API key, choose scopes, install an SDK, and call the Public API." },
  { slug: "authentication", title: "Authentication", category: "API", body: "Use Authorization: Bearer <apiKey>. Store keys outside source control and rotate them regularly." },
  { slug: "rate-limits", title: "Rate Limits", category: "API", body: "Public API responses include X-RateLimit-Remaining and X-RateLimit-Reset headers. The SDK retries 429 responses using Retry-After when present." },
  { slug: "pagination", title: "Pagination", category: "API", body: "List endpoints support page and limit. SDK Page objects expose nextPage, previousPage, and autoPagination." },
  { slug: "webhooks", title: "Webhooks", category: "Webhooks", body: "Verify X-Parentheses-Signature and use event ids as idempotency keys. Failed deliveries retry and eventually move to dead letter." },
  { slug: "sandbox", title: "Sandbox", category: "Sandbox", body: "Sandbox keys use the pl_test prefix and can execute mock API explorer calls without touching production data." },
  { slug: "release-automation", title: "Release Automation", category: "Releases", body: "GitHub release imports validate WordPress plugin ZIP artifacts and create draft plugin versions." },
];

const changelog = [
  { version: "v1", date: "2026-07-08", type: "stable", notes: "Initial Public API, API keys, webhooks, SDK foundation, release automation, and developer portal foundation." },
];

function endpointDocs() {
  return OpenApiService.endpoints.map((endpoint) => ({
    ...endpoint,
    curl: `curl -H "Authorization: Bearer $PARENTHESES_API_KEY" "$PARENTHESES_BASE_URL${endpoint.path}"`,
    sdk: endpoint.resource === "Products" ? "client.products.list()" : `client.${endpoint.resource.toLowerCase()}.list()`,
  }));
}

function webhookDocs() {
  return WebhookRegistry.list().map((event) => ({
    ...event,
    headers: ["X-Parentheses-Signature", "X-Parentheses-Timestamp", "X-Parentheses-Event"],
    retryPolicy: "1 minute, 5 minutes, 15 minutes, 1 hour, then dead letter.",
    payload: { id: "evt_example", event: event.name, timestamp: new Date(0).toISOString(), api_version: "2026-07-08", payload: {} },
  }));
}

function dashboard() {
  const openapi = OpenApiService.getOpenApiMetadata();
  const docs = {
    guides,
    endpoints: endpointDocs(),
    errors: OpenApiService.errorCodes,
    webhooks: webhookDocs(),
    rateLimits: {
      headers: ["X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
      retryBehavior: "Use exponential backoff. SDKs retry rate limits and transient server errors.",
      defaultLimits: { perMinute: 120, burst: 30, daily: 10000 },
    },
    changelog,
  };
  return {
    overview: {
      endpoints: docs.endpoints.length,
      webhookEvents: docs.webhooks.length,
      sdkCount: sdkCatalog.length,
      errorCodes: docs.errors.length,
      apiVersion: openapi.info.version,
    },
    docs,
    sdks: sdkCatalog,
    openapi,
    sandbox: {
      enabled: true,
      requiresSandboxKey: true,
      mockResponses: true,
      allowedMethods: ["GET"],
    },
  };
}

function postmanCollection() {
  const openapi = OpenApiService.getOpenApiMetadata();
  return {
    info: {
      name: "Parentheses Licence Public API",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      version: "1.0.0",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{api_key}}", type: "string" }] },
    variable: [{ key: "base_url", value: "{{base_url}}" }],
    item: OpenApiService.endpoints.map((endpoint) => ({
      name: `${endpoint.resource} - ${endpoint.description}`,
      request: {
        method: endpoint.method,
        header: [{ key: "Accept", value: "application/json" }],
        url: {
          raw: `{{base_url}}${endpoint.path}`,
          host: ["{{base_url}}"],
          path: endpoint.path.replace(/^\/+/, "").split("/"),
        },
        description: endpoint.description,
      },
      response: [{ name: "Example", originalRequest: {}, status: "OK", code: 200, body: JSON.stringify(endpoint.exampleResponse, null, 2) }],
    })),
    event: [],
    _meta: { openapi: openapi.openapi },
  };
}

function postmanEnvironment() {
  return {
    name: "Parentheses Licence Sandbox",
    values: [
      { key: "base_url", value: "https://your-license-server.example", type: "text", enabled: true },
      { key: "api_key", value: "pl_test_replace_me", type: "secret", enabled: true },
    ],
  };
}

function search(query = "") {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  const records = [
    ...guides.map((item) => ({ type: "guide", title: item.title, key: item.slug, text: item.body })),
    ...endpointDocs().map((item) => ({ type: "endpoint", title: `${item.method} ${item.path}`, key: item.id, text: `${item.resource} ${item.description} ${item.scope || ""}` })),
    ...OpenApiService.errorCodes.map((item) => ({ type: "error", title: item.code, key: item.code, text: `${item.description} ${item.resolution}` })),
    ...webhookDocs().map((item) => ({ type: "webhook", title: item.name, key: item.name, text: item.description })),
    ...sdkCatalog.map((item) => ({ type: "sdk", title: item.language, key: item.language, text: `${item.package} ${item.status}` })),
  ];
  return records.filter((item) => `${item.title} ${item.text}`.toLowerCase().includes(q)).slice(0, 25);
}

async function sandboxExecute({ apiKey, endpointId, method = "GET", params = {}, body = {} } = {}) {
  const auth = await ApiKeyService.authenticate(apiKey || "", { ip: "sandbox" });
  if (!auth.ok) {
    const err = new Error(auth.message);
    err.statusCode = 401;
    err.code = auth.code;
    throw err;
  }
  if (auth.apiKey.environment !== "sandbox") {
    const err = new Error("Sandbox explorer requires a sandbox API key.");
    err.statusCode = 403;
    err.code = "SANDBOX_KEY_REQUIRED";
    throw err;
  }
  const endpoint = OpenApiService.endpoints.find((item) => item.id === endpointId);
  if (!endpoint) {
    const err = new Error("Sandbox endpoint was not found.");
    err.statusCode = 404;
    err.code = "SANDBOX_ENDPOINT_NOT_FOUND";
    throw err;
  }
  if (endpoint.method !== method || method !== "GET") {
    const err = new Error("Sandbox explorer currently supports documented GET requests only.");
    err.statusCode = 405;
    err.code = "SANDBOX_METHOD_NOT_ALLOWED";
    throw err;
  }
  const scopes = auth.apiKey.scopes || [];
  if (endpoint.scope && !scopes.includes("admin") && !scopes.includes(endpoint.scope)) {
    const err = new Error(`Missing required scope: ${endpoint.scope}.`);
    err.statusCode = 403;
    err.code = "SCOPE_REQUIRED";
    throw err;
  }
  return {
    request: { method, path: endpoint.path, params, body: method === "GET" ? undefined : body },
    response: endpoint.exampleResponse,
    mock: true,
    environment: "sandbox",
  };
}

module.exports = {
  sdkCatalog,
  guides,
  changelog,
  dashboard,
  endpointDocs,
  webhookDocs,
  postmanCollection,
  postmanEnvironment,
  search,
  sandboxExecute,
};
