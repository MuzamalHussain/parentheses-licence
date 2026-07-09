const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resolve = (rel) => path.join(root, rel);

const store = { sessions: [], audits: [] };

function queryArray(items) {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(items.map((item) => ({ ...item }))),
  };
  return chain;
}

function mockModule(rel, exportsValue) {
  const file = require.resolve(resolve(rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsValue };
}

mockModule("src/models/AIDeveloperSession.js", {
  create: async (payload) => {
    const session = { _id: `dev_${store.sessions.length + 1}`, ...payload, createdAt: new Date() };
    store.sessions.unshift(session);
    return session;
  },
  find: (filter) => queryArray(store.sessions.filter((session) => session.organizationId === filter.organizationId)),
});

mockModule("src/services/ai/AIPermissionService.js", {
  assert: async (actor, organizationId, permission) => {
    if (permission !== "ai.developer.read") throw new Error("Unexpected permission");
    if (actor?.role === "admin" || actor?.role === "super_admin") return true;
    if (actor?.activeOrganizationId === organizationId && actor?.permissions?.includes(permission)) return true;
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  },
});

mockModule("src/services/ai/AIAuditService.js", {
  record: async (event, payload) => store.audits.push({ event, payload }),
});

const Copilot = require("../src/services/aiDeveloper/AIDeveloperAssistant");
const Examples = require("../src/services/aiDeveloper/AICodeExampleGenerator");
const Debug = require("../src/services/aiDeveloper/AIDebugAssistant");
const Architecture = require("../src/services/aiDeveloper/AIArchitectureExplainer");

const admin = { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" };

async function testApiExplanation() {
  const result = await Copilot.ask({
    actor: admin,
    organizationId: "org_1",
    question: "Explain the list products API endpoint and rate limits.",
    category: "api",
    endpointId: "listProducts",
  });
  assert.strictEqual(result.category, "api");
  assert.match(result.answer, /Bearer API keys/);
  assert.strictEqual(result.context.endpoint.id, "listProducts");
  assert.ok(result.context.rateLimits.headers.includes("Retry-After"));
}

async function testSdkAndCodeGeneration() {
  const example = Examples.buildExample({ endpointId: "listOrders", language: "php" });
  assert.strictEqual(example.language, "php");
  assert.match(example.example, /PARENTHESES_API_KEY/);
  assert.ok(!example.example.includes("sk_live"));

  const result = await Copilot.ask({
    actor: admin,
    organizationId: "org_1",
    question: "Generate a Node.js code example.",
    category: "code",
    language: "node",
    endpointId: "listOrders",
  });
  assert.strictEqual(result.category, "code");
  assert.match(result.codeExamples.example, /ParenthesesLicenceClient/);
  assert.strictEqual(result.safety.terminalExecution, false);
}

async function testDebugExplanation() {
  const debug = Debug.explain("SCOPE_REQUIRED when calling licenses endpoint");
  assert.strictEqual(debug.type, "api_error");
  assert.strictEqual(debug.matchedError.code, "SCOPE_REQUIRED");

  const result = await Copilot.ask({
    actor: admin,
    organizationId: "org_1",
    question: "403 SCOPE_REQUIRED on downloads.read",
    category: "debug",
  });
  assert.match(result.answer, /SCOPE_REQUIRED/);
  assert.strictEqual(result.context.type, "api_error");
}

async function testArchitectureExplanation() {
  const architecture = Architecture.explain("licensing");
  assert.ok(architecture.serviceFlow.length >= 3);
  assert.ok(architecture.databaseRelationships.some((item) => item.from === "License" && item.to === "LicenseSite"));

  const result = await Copilot.ask({
    actor: admin,
    organizationId: "org_1",
    question: "Explain licensing architecture flow.",
    category: "architecture",
    topic: "licensing",
  });
  assert.match(result.answer, /license engine validates/);
}

async function testHistoryAuditAndPermissions() {
  const history = await Copilot.history({ actor: admin, organizationId: "org_1" });
  assert.ok(history.length >= 4);
  assert.ok(store.audits.some((entry) => entry.event === "ai.developer_example_generated"));
  assert.ok(store.audits.some((entry) => entry.event === "ai.developer_debug_session"));

  await assert.rejects(
    () => Copilot.ask({
      actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_2" },
      organizationId: "org_1",
      question: "Explain API.",
      category: "api",
    }),
    /Forbidden/,
  );
}

(async () => {
  await testApiExplanation();
  await testSdkAndCodeGeneration();
  await testDebugExplanation();
  await testArchitectureExplanation();
  await testHistoryAuditAndPermissions();
  console.log("Phase 14H AI developer copilot tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
