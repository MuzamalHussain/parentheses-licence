const capabilities = [
  { key: "auth.session", version: "v1", methods: ["POST"], path: "/api/v1/auth/*", apiKeyReady: false },
  { key: "products.read", version: "v1", methods: ["GET"], path: "/api/v1/products", apiKeyReady: true },
  { key: "licenses.read", version: "v1", methods: ["GET"], path: "/api/v1/licenses", apiKeyReady: true },
  { key: "downloads.request", version: "v1", methods: ["POST"], path: "/api/v1/downloads/request", apiKeyReady: true },
  { key: "orders.read", version: "v1", methods: ["GET"], path: "/api/v1/orders", apiKeyReady: true },
  { key: "webhooks.outgoing", version: "v1", methods: ["POST"], path: "integration-managed", apiKeyReady: true },
  { key: "integrations.admin", version: "v1", methods: ["GET", "POST"], path: "/api/v1/admin/integrations", apiKeyReady: false },
  { key: "public.products.read", version: "public-v1", methods: ["GET"], path: "/api/public/v1/products", apiKeyReady: true },
  { key: "public.licenses.read", version: "public-v1", methods: ["GET"], path: "/api/public/v1/licenses", apiKeyReady: true },
  { key: "public.analytics.read", version: "public-v1", methods: ["GET"], path: "/api/public/v1/analytics/summary", apiKeyReady: true },
];

function listCapabilities() {
  return capabilities.map((capability) => ({ ...capability }));
}

function getDocumentationMetadata() {
  return {
    versions: ["v1"],
    current: "v1",
    apiKeySupport: "foundation",
    capabilities: listCapabilities(),
  };
}

module.exports = { listCapabilities, getDocumentationMetadata };
