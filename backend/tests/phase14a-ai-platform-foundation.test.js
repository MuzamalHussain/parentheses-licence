const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14a_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14a_ai_secret_with_enough_entropy";
process.env.APP_ENCRYPTION_KEY = process.env.AI_SETTINGS_SECRET;

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function setMock(relativePath, exports) {
  const resolved = clearModule(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function doc(data) {
  return { ...data, toObject() { return { ...this }; }, async save() { return this; } };
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && "$ne" in value) return String(row[key]) !== String(value.$ne);
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(row[key]));
    return value === undefined || String(row[key]) === String(value);
  });
}

function chain(value) {
  return {
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function upsert(list, filter, update, prefix) {
  let row = list.find((item) => matches(item, filter));
  if (!row) {
    row = doc({ _id: `${prefix}_${list.length + 1}`, createdAt: new Date(), ...filter, ...(update.$setOnInsert || {}) });
    list.push(row);
  }
  Object.assign(row, update.$set || update);
  return row;
}

function loadAIWithMocks() {
  const store = {
    providers: [],
    models: [],
    prompts: [],
    usage: [],
    memberships: [],
    audits: [],
  };

  [
    "src/services/ai/AIProviderRegistry.js",
    "src/services/ai/AIProviderInterface.js",
    "src/services/ai/AIManager.js",
    "src/services/ai/AIModelRegistry.js",
    "src/services/ai/PromptRegistry.js",
    "src/services/ai/AIRequestService.js",
    "src/services/ai/AITokenTracker.js",
    "src/services/ai/AICostTracker.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIAuditService.js",
    "src/models/AIProviderConfig.js",
    "src/models/AIModel.js",
    "src/models/AIPromptTemplate.js",
    "src/models/AIUsageLog.js",
    "src/models/OrganizationMembership.js",
    "src/models/Organization.js",
    "src/models/OrganizationInvitation.js",
    "src/models/User.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
  ].forEach(clearModule);

  const Provider = {
    find(filter = {}) { return chain(store.providers.filter((row) => matches(row, filter))); },
    findOne(filter = {}) { return chain(store.providers.find((row) => matches(row, filter)) || null); },
    async findOneAndUpdate(filter, update) { return upsert(store.providers, filter, update, "provider"); },
  };
  const Model = {
    find(filter = {}) { return chain(store.models.filter((row) => matches(row, filter))); },
    findOne(filter = {}) { return chain(store.models.find((row) => matches(row, filter)) || null); },
    async findOneAndUpdate(filter, update) { return upsert(store.models, filter, update, "model"); },
    async updateMany(filter, update) {
      store.models.filter((row) => matches(row, filter)).forEach((row) => Object.assign(row, update.$set || update));
      return { modifiedCount: 1 };
    },
  };
  const Prompt = {
    find(filter = {}) { return chain(store.prompts.filter((row) => matches(row, filter))); },
    async findOneAndUpdate(filter, update) { return upsert(store.prompts, filter, update, "prompt"); },
  };
  const Usage = {
    async create(input) {
      const row = doc({ _id: `usage_${store.usage.length + 1}`, createdAt: new Date(), ...input });
      store.usage.push(row);
      return row;
    },
    async aggregate() {
      const grouped = new Map();
      store.usage.forEach((row) => {
        const key = `${row.providerId}:${row.modelId}`;
        const current = grouped.get(key) || { _id: { providerId: row.providerId, modelId: row.modelId }, requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, averageResponseTimeMs: 0 };
        current.requests += 1;
        current.promptTokens += row.promptTokens || 0;
        current.completionTokens += row.completionTokens || 0;
        current.totalTokens += row.totalTokens || 0;
        current.estimatedCost += row.estimatedCost || 0;
        current.averageResponseTimeMs = row.responseTimeMs || 0;
        grouped.set(key, current);
      });
      return [...grouped.values()];
    },
  };

  setMock("src/models/AIProviderConfig.js", Provider);
  setMock("src/models/AIModel.js", Model);
  setMock("src/models/AIPromptTemplate.js", Prompt);
  setMock("src/models/AIUsageLog.js", Usage);
  setMock("src/models/OrganizationMembership.js", { findOne: () => chain(null) });
  setMock("src/models/Organization.js", { findById: () => chain(doc({ _id: "org_1", status: "active" })) });
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/models/User.js", {});
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    registry: require(path.join(root, "src/services/ai/AIProviderRegistry.js")),
    manager: require(path.join(root, "src/services/ai/AIManager.js")),
    models: require(path.join(root, "src/services/ai/AIModelRegistry.js")),
    prompts: require(path.join(root, "src/services/ai/PromptRegistry.js")),
    requests: require(path.join(root, "src/services/ai/AIRequestService.js")),
    costs: require(path.join(root, "src/services/ai/AICostTracker.js")),
  };
}

async function testProviderRegistryAndConfiguration() {
  const { registry, manager, store } = loadAIWithMocks();
  assert.ok(registry.list().some((provider) => provider.id === "openai"));
  const provider = await manager.saveProvider("org_1", { providerId: "openai", name: "OpenAI", apiKey: "sk-secret", status: "configured" }, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(provider.apiKeyConfigured, true);
  assert.strictEqual(provider.encryptedApiKey, undefined);
  assert.ok(store.providers[0].encryptedApiKey);
  assert.ok(store.audits.some((entry) => entry.action === "ai.api_key_changed"));
}

async function testModelRegistryAndPromptRegistry() {
  const { models, prompts } = loadAIWithMocks();
  const model = await models.registerModel("org_1", { providerId: "openai", modelId: "gpt-test", displayName: "GPT Test", status: "enabled", isDefault: true, pricing: { promptPerMillion: 1, completionPerMillion: 2 } }, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(model.status, "enabled");
  const prompt = await prompts.savePrompt("org_1", { key: "support.answer", name: "Support Answer", category: "support", content: "Answer safely.", status: "active" }, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(prompt.category, "support");
}

async function testTokenCostAndFailoverTracking() {
  const { manager, models, requests, costs, store } = loadAIWithMocks();
  await manager.saveProvider("org_1", { providerId: "openai", name: "OpenAI", apiKey: "sk-secret", status: "configured", fallbackOrder: 1 }, { actor: { _id: "admin_1", role: "admin" } });
  await manager.saveProvider("org_1", { providerId: "anthropic", name: "Anthropic", apiKey: "ak-secret", status: "configured", fallbackOrder: 2 }, { actor: { _id: "admin_1", role: "admin" } });
  store.providers[0].health = { status: "unavailable" };
  await models.registerModel("org_1", { providerId: "anthropic", modelId: "claude-test", displayName: "Claude Test", status: "enabled", pricing: { promptPerMillion: 3, completionPerMillion: 15 } }, { actor: { _id: "admin_1", role: "admin" } });
  const result = await requests.simulateRequest({ organizationId: "org_1", providerId: "openai", modelId: "claude-test", promptTokens: 1000, completionTokens: 500, requestType: "chat" }, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(result.providerId, "anthropic");
  assert.strictEqual(store.usage[0].totalTokens, 1500);
  assert.strictEqual(costs.estimateCost({ promptTokens: 1000, completionTokens: 500, pricing: { promptPerMillion: 3, completionPerMillion: 15 } }), 0.0105);
  assert.ok(store.audits.some((entry) => entry.action === "ai.provider_failover"));
}

async function testOverviewAndPermissions() {
  const { manager, store } = loadAIWithMocks();
  await manager.saveProvider("org_1", { providerId: "gemini", name: "Gemini", apiKey: "g-secret", status: "configured" }, { actor: { _id: "admin_1", role: "admin" } });
  const overview = await manager.overview("org_1", { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(overview.providers.length, 1);
  await assert.rejects(
    () => manager.saveProvider("org_1", { providerId: "openai", name: "OpenAI" }, { actor: { _id: "user_1", role: "customer" } }),
    (err) => err.statusCode === 403
  );
  assert.ok(store.audits.length > 0);
}

async function run() {
  const tests = [
    testProviderRegistryAndConfiguration,
    testModelRegistryAndPromptRegistry,
    testTokenCostAndFailoverTracking,
    testOverviewAndPermissions,
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
