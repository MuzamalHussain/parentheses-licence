const relationships = [
  { from: "Organization", to: "Products", relation: "owns product catalog and developer resources" },
  { from: "Product", to: "PluginVersion", relation: "has many release versions and channels" },
  { from: "PluginVersion", to: "Download", relation: "authorizes secure release assets" },
  { from: "License", to: "LicenseSite", relation: "controls activations, validation, and heartbeat telemetry" },
  { from: "Order", to: "License", relation: "completed orders can generate license eligibility" },
  { from: "WebhookEndpoint", to: "OutgoingWebhook", relation: "receives event deliveries and retry state" },
  { from: "AIProviderConfig", to: "AIUsageLog", relation: "tracks provider/model usage and cost" },
];

const flows = {
  api: ["API key middleware authenticates bearer key", "scope middleware validates endpoint capability", "controller loads tenant-scoped records", "standard JSON success/error response is returned"],
  licensing: ["Plugin submits license key and site data", "license engine validates status, expiry, and activation limits", "site activation or heartbeat is recorded", "updater/download eligibility remains separate"],
  downloads: ["download request validates license and channel eligibility", "download engine records audit/history", "signed URL is generated", "storage adapter serves metadata and files"],
  webhooks: ["business event is registered", "delivery service signs payload", "retry service handles failures", "dead-letter queue keeps unresolved deliveries inspectable"],
  ai: ["AI permission service checks actor and organization", "prompt/context services build grounded context", "request service tracks provider usage", "audit service records AI activity"],
};

function explain(topic = "platform") {
  const key = String(topic || "").toLowerCase();
  const selected = flows[key] || flows.api;
  return {
    topic: flows[key] ? key : "platform",
    serviceFlow: selected,
    moduleDependencies: {
      developerCopilot: ["DeveloperPortalService", "OpenApiService", "WebhookRegistry", "AI Platform", "RBAC"],
      publicApi: ["ApiKeyService", "PublicApiRateLimiter", "OpenApiService"],
      pluginUpdater: ["plugin routes", "license validation", "version metadata", "download engine"],
    },
    databaseRelationships: relationships,
    boundaries: [
      "Developer copilot explains and generates examples only.",
      "It does not execute terminal commands, modify repositories, deploy code, or publish releases.",
      "Tenant-scoped answers must respect organization and RBAC context.",
    ],
  };
}

module.exports = { explain, flows, relationships };
