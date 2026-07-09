const DeveloperPortal = require("../developerPortal/DeveloperPortalService");
const OpenApiService = require("../publicApi/OpenApiService");

const promptLibrary = [
  { key: "api-integration", category: "api", title: "API Integration", prompt: "Explain how to call a Parentheses Licence Public API endpoint with authentication, scopes, errors, and retries." },
  { key: "sdk-usage", category: "sdk", title: "SDK Usage", prompt: "Generate an SDK example for a selected endpoint and language using safe placeholders." },
  { key: "webhook-integration", category: "webhook", title: "Webhook Integration", prompt: "Explain webhook signature verification, retries, delivery logs, and idempotency handling." },
  { key: "plugin-development", category: "plugin", title: "WordPress Plugin Development", prompt: "Explain updater, license validation, downloads, version checks, and API integration patterns." },
  { key: "debugging", category: "debug", title: "Debugging", prompt: "Explain an API, webhook, authentication, validation, or permission error using platform error metadata." },
  { key: "architecture", category: "architecture", title: "Architecture", prompt: "Explain platform service flow, dependencies, database relationships, and module boundaries." },
];

function apiReference(endpointId = "") {
  const endpoints = DeveloperPortal.endpointDocs();
  const endpoint = endpointId ? endpoints.find((item) => item.id === endpointId) : endpoints[0];
  const errors = OpenApiService.errorCodes;
  return {
    endpoint,
    authentication: "Use Authorization: Bearer <apiKey>. API keys are stored hashed and can be scoped, rotated, revoked, or sandbox-only.",
    headers: ["Authorization", "Accept: application/json", "X-API-Nonce for protected write requests"],
    parameters: { path: endpoint?.params || [], query: endpoint?.query || [] },
    response: endpoint?.exampleResponse || {},
    errorCodes: errors,
    rateLimits: DeveloperPortal.dashboard().docs.rateLimits,
  };
}

function sdkReference(language = "") {
  const catalog = DeveloperPortal.sdkCatalog;
  const selected = catalog.find((sdk) => sdk.language.toLowerCase() === String(language || "").toLowerCase()) || null;
  return {
    selected,
    catalog,
    capabilities: ["automatic bearer headers", "JSON parsing", "typed errors", "pagination helpers", "retry foundation", "rate limit handling"],
  };
}

function webhookReference(eventName = "") {
  const webhooks = DeveloperPortal.webhookDocs();
  const event = eventName ? webhooks.find((item) => item.name === eventName) : webhooks[0];
  return {
    event,
    events: webhooks,
    signatures: "Verify X-Parentheses-Signature with the endpoint secret and reject mismatched timestamps.",
    retries: "Failed deliveries retry at 1 minute, 5 minutes, 15 minutes, 1 hour, then move to dead letter.",
    idempotency: "Use event id as the idempotency key before mutating local state.",
  };
}

function pluginReference() {
  return {
    endpoints: [
      "POST /api/v1/plugin/activate",
      "POST /api/v1/plugin/deactivate",
      "POST /api/v1/plugin/check",
      "POST /api/v1/plugin/update-check",
      "POST /api/v1/plugin/heartbeat",
    ],
    guidance: [
      "Treat the license key as the plugin credential and never log it in plaintext.",
      "Use update-check for WordPress updater compatibility and heartbeat for active-site telemetry.",
      "Use signed download URLs returned by the download engine instead of direct file paths.",
      "Cache positive validation briefly, but re-check before privileged update/download actions.",
    ],
  };
}

function dashboard() {
  const portal = DeveloperPortal.dashboard();
  return {
    overview: {
      endpoints: portal.overview.endpoints,
      sdkCount: portal.overview.sdkCount,
      webhookEvents: portal.overview.webhookEvents,
      promptCount: promptLibrary.length,
      apiVersion: portal.overview.apiVersion,
    },
    prompts: promptLibrary,
    sdks: portal.sdks,
    endpoints: portal.docs.endpoints,
    webhooks: portal.docs.webhooks,
    errors: portal.docs.errors,
    plugin: pluginReference(),
    streamingFoundation: true,
    contextCaching: "Documentation metadata is reused from DeveloperPortalService and OpenApiService.",
  };
}

module.exports = { promptLibrary, apiReference, sdkReference, webhookReference, pluginReference, dashboard };
