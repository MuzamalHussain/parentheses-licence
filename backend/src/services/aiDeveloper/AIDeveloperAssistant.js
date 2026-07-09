const AIDeveloperSession = require("../../models/AIDeveloperSession");
const Permissions = require("../ai/AIPermissionService");
const Audit = require("../ai/AIAuditService");
const Guide = require("./AIIntegrationGuideService");
const Examples = require("./AICodeExampleGenerator");
const Debug = require("./AIDebugAssistant");
const Architecture = require("./AIArchitectureExplainer");

function orgFor(actor, organizationId) {
  return organizationId || actor?.activeOrganizationId || null;
}

function classify(question = "", explicit = "") {
  if (explicit) return explicit;
  const q = String(question || "").toLowerCase();
  if (q.includes("stack") || q.includes("error") || q.includes("debug") || q.includes("403") || q.includes("401") || q.includes("429")) return "debug";
  if (q.includes("webhook") || q.includes("signature") || q.includes("retry")) return "webhook";
  if (q.includes("sdk") || q.includes("typescript") || q.includes("javascript") || q.includes("node") || q.includes("php")) return "sdk";
  if (q.includes("curl") || q.includes("example") || q.includes("code")) return "code";
  if (q.includes("plugin") || q.includes("updater") || q.includes("license validation") || q.includes("download")) return "plugin";
  if (q.includes("architecture") || q.includes("flow") || q.includes("database") || q.includes("relationship")) return "architecture";
  if (q.includes("endpoint") || q.includes("api") || q.includes("scope") || q.includes("rate limit")) return "api";
  return "general";
}

function tokenCount(text = "") {
  return Math.max(1, Math.ceil(String(text || "").split(/\s+/).filter(Boolean).length * 1.35));
}

function formatAnswer(category, payload) {
  if (category === "api") {
    const endpoint = payload.endpoint || {};
    return `API endpoint ${endpoint.method || "GET"} ${endpoint.path || ""}: ${endpoint.description || "documented public API endpoint"}. Authenticate with Bearer API keys, send Accept: application/json, provide documented parameters, handle standardized JSON errors, and respect rate-limit headers.`;
  }
  if (category === "sdk") {
    const selected = payload.selected;
    return selected
      ? `${selected.language} SDK support is ${selected.status}. Use ${selected.package} for ${selected.runtime}; it provides authentication headers, JSON parsing, pagination, retries, and typed error handling foundation.`
      : "JavaScript, TypeScript, Node.js, and PHP SDK foundations are available; Python, Go, and C# are placeholders for future SDKs.";
  }
  if (category === "webhook") {
    return `Webhook ${payload.event?.name || "events"} use signed delivery headers, retry policy, delivery logs, and event-id idempotency. Verify signatures before processing payloads.`;
  }
  if (category === "plugin") {
    return `WordPress plugin integration uses activation, deactivation, check, update-check, and heartbeat endpoints. The plugin should never access release files directly; use license validation and signed download/update responses.`;
  }
  if (category === "debug") return `${payload.explanation} Recommended checks: ${payload.likelyCauses.join(" ")}`;
  if (category === "architecture") return `Architecture flow for ${payload.topic}: ${payload.serviceFlow.join(" -> ")}. Boundaries: ${payload.boundaries.join(" ")}`;
  if (category === "code") return `Generated ${payload.language} example for ${payload.endpoint.method} ${payload.endpoint.path}. Use environment variables for base URL and API key; required scope is ${payload.endpoint.scope || "none"}.`;
  return "Developer copilot can explain APIs, SDKs, webhooks, plugin updater flows, debugging errors, architecture, and generate safe code examples.";
}

async function ask({ actor, organizationId, question = "", category = "", language = "javascript", endpointId = "", topic = "" } = {}, context = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.developer.read");
  const selected = classify(question, category);
  let payload;
  if (selected === "api") payload = Guide.apiReference(endpointId);
  else if (selected === "sdk") payload = Guide.sdkReference(language);
  else if (selected === "webhook") payload = Guide.webhookReference();
  else if (selected === "plugin") payload = Guide.pluginReference();
  else if (selected === "debug") payload = Debug.explain(question);
  else if (selected === "architecture") payload = Architecture.explain(topic || question);
  else if (selected === "code") payload = Examples.buildExample({ endpointId, language });
  else payload = Guide.dashboard();

  const answer = formatAnswer(selected, payload);
  const promptTokens = tokenCount(question);
  const completionTokens = tokenCount(answer);
  const session = await AIDeveloperSession.create({
    organizationId: orgId,
    userId: actor._id,
    category: selected,
    question,
    answer,
    contextSummary: "Grounded with DeveloperPortalService, OpenApiService, SDK catalog, webhook registry, plugin route metadata, and AI/RBAC rules.",
    promptKey: `developer.${selected}`,
    language: selected === "code" ? payload.language : language,
    codeExamples: selected === "code" ? payload : {},
    references: payload?.endpoint ? [payload.endpoint] : payload?.event ? [payload.event] : [],
    safety: {
      repositoryMutation: false,
      terminalExecution: false,
      deploysCode: false,
      exposesSecrets: false,
      advisoryOnly: true,
    },
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  });
  await Audit.record(
    selected === "code" ? "ai.developer_example_generated" : selected === "debug" ? "ai.developer_debug_session" : selected === "architecture" ? "ai.developer_architecture_explained" : "ai.developer_query",
    { actor, organizationId: orgId, targetId: session._id, ip: context.ip, requestId: context.requestId, metadata: { category: selected, language, endpointId } }
  );
  return { sessionId: session._id, category: selected, answer, context: payload, safety: session.safety, codeExamples: session.codeExamples };
}

async function history({ actor, organizationId, limit = 25 } = {}) {
  const orgId = orgFor(actor, organizationId);
  await Permissions.assert(actor, orgId, "ai.developer.read");
  return AIDeveloperSession.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 25, 100)).lean();
}

module.exports = { ask, history, classify, dashboard: Guide.dashboard, promptLibrary: () => Guide.promptLibrary };
