const DeveloperPortal = require("../developerPortal/DeveloperPortalService");

const SUPPORTED_LANGUAGES = ["javascript", "typescript", "node", "php", "curl"];
const FUTURE_LANGUAGES = ["python", "go", "csharp"];

function normalizeLanguage(language = "javascript") {
  const key = String(language || "").toLowerCase().replace(/[^a-z#]/g, "");
  if (key === "js") return "javascript";
  if (key === "ts") return "typescript";
  if (key === "nodejs") return "node";
  if (key === "c#") return "csharp";
  return SUPPORTED_LANGUAGES.includes(key) ? key : "javascript";
}

function endpointFor(endpointId) {
  const endpoints = DeveloperPortal.endpointDocs();
  return endpoints.find((endpoint) => endpoint.id === endpointId)
    || endpoints.find((endpoint) => endpoint.id === "listProducts")
    || endpoints[0];
}

function clientResource(endpoint) {
  const resource = String(endpoint?.resource || "products").toLowerCase();
  if (resource === "metadata") return "metadata";
  return resource;
}

function buildExample({ endpointId = "listProducts", language = "javascript" } = {}) {
  const endpoint = endpointFor(endpointId);
  const lang = normalizeLanguage(language);
  const resource = clientResource(endpoint);
  const path = endpoint?.path || "/api/public/v1/products";
  const method = endpoint?.method || "GET";
  const sdkCall = endpoint?.sdk || `client.${resource}.list()`;
  const examples = {
    javascript: `import { ParenthesesLicenceClient } from "@parentheses/licence-sdk";

const client = new ParenthesesLicenceClient({
  baseUrl: process.env.PARENTHESES_BASE_URL,
  apiKey: process.env.PARENTHESES_API_KEY,
});

const response = await ${sdkCall};
console.log(response.data);`,
    typescript: `import { ParenthesesLicenceClient } from "@parentheses/licence-sdk";

const client = new ParenthesesLicenceClient({
  baseUrl: process.env.PARENTHESES_BASE_URL!,
  apiKey: process.env.PARENTHESES_API_KEY!,
});

const response = await ${sdkCall};
console.log(response.data);`,
    node: `const { ParenthesesLicenceClient } = require("@parentheses/licence-sdk");

const client = new ParenthesesLicenceClient({
  baseUrl: process.env.PARENTHESES_BASE_URL,
  apiKey: process.env.PARENTHESES_API_KEY,
});

async function main() {
  const response = await ${sdkCall};
  console.log(response.data);
}

main().catch((error) => {
  console.error(error.code || "REQUEST_FAILED", error.message);
  process.exitCode = 1;
});`,
    php: `<?php
require __DIR__ . "/vendor/autoload.php";

$client = new Parentheses\\Licence\\ParenthesesLicenceClient([
    "base_url" => getenv("PARENTHESES_BASE_URL"),
    "api_key" => getenv("PARENTHESES_API_KEY"),
]);

$response = $client->request("${method}", "${path}");
print_r($response["data"]);`,
    curl: `curl -X ${method} \\
  -H "Authorization: Bearer $PARENTHESES_API_KEY" \\
  -H "Accept: application/json" \\
  "$PARENTHESES_BASE_URL${path}"`,
  };
  return {
    language: lang,
    endpoint: { id: endpoint?.id, method, path, scope: endpoint?.scope, description: endpoint?.description },
    example: examples[lang],
    notes: [
      "Store API keys in environment variables or a secrets manager.",
      "Use sandbox keys with the developer portal explorer before production.",
      endpoint?.scope ? `Required scope: ${endpoint.scope}.` : "This endpoint does not require a scoped API key.",
    ],
  };
}

function catalog() {
  return { supported: SUPPORTED_LANGUAGES, future: FUTURE_LANGUAGES, sdks: DeveloperPortal.sdkCatalog };
}

module.exports = { SUPPORTED_LANGUAGES, FUTURE_LANGUAGES, normalizeLanguage, buildExample, catalog };
