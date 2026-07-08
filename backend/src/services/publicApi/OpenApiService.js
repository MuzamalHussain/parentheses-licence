const { API_KEY_SCOPES } = require("../../models/ApiKey");

const endpoints = [
  {
    id: "listProducts",
    method: "GET",
    path: "/api/public/v1/products",
    publicPath: "/products",
    scope: "products.read",
    resource: "Products",
    description: "List public products.",
    query: ["page", "limit", "search"],
    exampleResponse: { success: true, data: [{ id: "prod_123", name: "Example Plugin", slug: "example-plugin" }], pagination: { page: 1, limit: 20, total: 1, pages: 1 } },
  },
  {
    id: "listVersions",
    method: "GET",
    path: "/api/public/v1/products/:id/versions",
    publicPath: "/products/{id}/versions",
    scope: "products.read",
    resource: "Versions",
    description: "List published product versions.",
    params: ["id"],
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ versionNumber: "1.2.3", releaseChannel: "stable" }] },
  },
  {
    id: "listLicenses",
    method: "GET",
    path: "/api/public/v1/licenses",
    publicPath: "/licenses",
    scope: "licenses.read",
    resource: "Licenses",
    description: "List scoped license records.",
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ licenseKey: "****-****", status: "active" }] },
  },
  {
    id: "listOrders",
    method: "GET",
    path: "/api/public/v1/orders",
    publicPath: "/orders",
    scope: "orders.read",
    resource: "Orders",
    description: "List scoped order records.",
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ orderNumber: "ORD-1001", status: "completed" }] },
  },
  {
    id: "listDownloads",
    method: "GET",
    path: "/api/public/v1/downloads",
    publicPath: "/downloads",
    scope: "downloads.read",
    resource: "Downloads",
    description: "List scoped download records.",
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ fileName: "plugin.zip", status: "completed" }] },
  },
  {
    id: "listCustomers",
    method: "GET",
    path: "/api/public/v1/customers",
    publicPath: "/customers",
    scope: "customers.read",
    resource: "Customers",
    description: "List authorized customers.",
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ name: "Customer", email: "customer@example.test" }] },
  },
  {
    id: "listActivations",
    method: "GET",
    path: "/api/public/v1/activations",
    publicPath: "/activations",
    scope: "licenses.read",
    resource: "Activations",
    description: "List license activations.",
    query: ["page", "limit"],
    exampleResponse: { success: true, data: [{ domain: "example.test", status: "active" }] },
  },
  {
    id: "analyticsSummary",
    method: "GET",
    path: "/api/public/v1/analytics/summary",
    publicPath: "/analytics/summary",
    scope: "analytics.read",
    resource: "Analytics",
    description: "Read analytics summary.",
    query: ["period", "start", "end"],
    exampleResponse: { success: true, data: { revenue: 0, orders: 0, customers: 0 } },
  },
  {
    id: "openApi",
    method: "GET",
    path: "/api/public/v1/openapi",
    publicPath: "/openapi",
    scope: null,
    resource: "Metadata",
    description: "Read OpenAPI metadata.",
    exampleResponse: { success: true, data: { openapi: "3.0.3" } },
  },
];

const errorCodes = [
  { code: "API_KEY_REQUIRED", status: 401, description: "Bearer API key is missing.", resolution: "Send Authorization: Bearer <apiKey>." },
  { code: "API_KEY_INVALID", status: 401, description: "API key could not be authenticated.", resolution: "Check the key value or rotate the key." },
  { code: "API_KEY_REVOKED", status: 401, description: "API key has been revoked.", resolution: "Create or rotate an active key." },
  { code: "API_KEY_EXPIRED", status: 401, description: "Temporary key has expired.", resolution: "Create a new key." },
  { code: "SCOPE_REQUIRED", status: 403, description: "API key lacks the required scope.", resolution: "Grant the documented endpoint scope." },
  { code: "RATE_LIMITED", status: 429, description: "Per-key minute rate limit exceeded.", resolution: "Back off and retry after the reset window." },
  { code: "BURST_LIMITED", status: 429, description: "Endpoint burst limit exceeded.", resolution: "Use exponential backoff." },
  { code: "REPLAY_DETECTED", status: 409, description: "Nonce has already been used.", resolution: "Generate a unique X-API-Nonce for write requests." },
  { code: "PUBLIC_API_ERROR", status: 500, description: "Unexpected API failure.", resolution: "Retry safely and contact support with requestId." },
];

function pathToOpenApi(publicPath) {
  return publicPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function responseSchemaRef() {
  return {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessResponse" },
      examples: { default: { value: { success: true, data: [] } } },
    },
  };
}

function operationFor(endpoint) {
  return {
    operationId: endpoint.id,
    summary: endpoint.description,
    description: endpoint.description,
    tags: [endpoint.resource],
    security: endpoint.scope ? [{ bearerApiKey: [] }] : [],
    parameters: [
      ...(endpoint.params || []).map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
      ...(endpoint.query || []).map((name) => ({ name, in: "query", required: false, schema: { type: "string" } })),
    ],
    responses: {
      200: { description: "Successful response.", content: responseSchemaRef() },
      401: { description: "Authentication error.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      403: { description: "Permission error.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      429: { description: "Rate limited.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
    "x-scope": endpoint.scope,
    "x-example-response": endpoint.exampleResponse,
  };
}

function getOpenApiMetadata() {
  const paths = {};
  endpoints.forEach((endpoint) => {
    const pathKey = pathToOpenApi(endpoint.publicPath);
    paths[pathKey] = paths[pathKey] || {};
    paths[pathKey][endpoint.method.toLowerCase()] = operationFor(endpoint);
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "Parentheses Licence Public API",
      version: "v1",
      description: "Official external REST API for products, licenses, commerce, downloads, analytics, and developer integrations.",
    },
    servers: [{ url: "/api/public/v1" }],
    security: [{ bearerApiKey: [] }],
    components: {
      securitySchemes: {
        bearerApiKey: { type: "http", scheme: "bearer", bearerFormat: "API Key" },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {},
            pagination: { $ref: "#/components/schemas/Pagination" },
            requestId: { type: "string" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
            requestId: { type: "string" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 100 },
            pages: { type: "integer", example: 5 },
          },
        },
      },
    },
    paths,
    scopes: API_KEY_SCOPES,
    endpoints,
    errorCodes,
  };
}

module.exports = { endpoints, errorCodes, getOpenApiMetadata };
