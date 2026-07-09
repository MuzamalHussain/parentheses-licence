const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14b_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14b_ai_secret_with_enough_entropy";

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
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(row[key]));
    if (key === "_id") return String(row._id) === String(value);
    return value === undefined || String(row[key]) === String(value);
  });
}

function chain(value) {
  return {
    populate() { return this; },
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function model(list, prefix) {
  function Model(input) {
    const row = doc({ _id: `${prefix}_${list.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input });
    row.save = async function save() {
      const existing = list.find((item) => item._id === this._id);
      if (!existing) list.push(this);
      return this;
    };
    return row;
  }
  Model.find = (filter = {}) => chain(list.filter((row) => matches(row, filter)));
  Model.findOne = (filter = {}) => chain(list.find((row) => matches(row, filter)) || null);
  Model.create = async (input) => {
    const row = Model(input);
    list.push(row);
    return row;
  };
  Model.aggregate = async () => [];
  return Model;
}

function loadAssistantWithMocks() {
  const store = {
    orgs: [doc({ _id: "org_1", name: "Acme", slug: "acme", status: "active" }), doc({ _id: "org_2", name: "Other", slug: "other", status: "active" })],
    memberships: [doc({ _id: "mem_1", organizationId: doc({ _id: "org_1", name: "Acme", slug: "acme", status: "active" }), userId: "user_1", status: "active", role: "owner" })],
    users: [doc({ _id: "user_1", name: "Ava", email: "ava@example.test", role: "customer", activeOrganizationId: "org_1", twoFactorEnabled: true })],
    licenses: [doc({ _id: "lic_1", organizationId: "org_1", userId: "user_1", status: "active", licenseType: "single_site", allowedSites: 1, activeDomains: [{ domain: "example.com" }], expiresAt: new Date("2027-01-01"), entitlements: { downloads: true }, productId: { name: "Plugin Pro" }, planId: { name: "Single Site" } })],
    orders: [doc({ _id: "ord_1", organizationId: "org_1", userId: "user_1", orderNumber: "ORD-1", status: "completed", paymentStatus: "paid", grandTotal: 49, currency: "USD" })],
    downloads: [doc({ _id: "down_1", organizationId: "org_1", userId: "user_1", status: "completed", fileName: "plugin.zip", releaseChannel: "stable" })],
    payments: [doc({ _id: "pay_1", organizationId: "org_1", status: "succeeded", gateway: "manual", amount: 49, currency: "USD" })],
    notifications: [doc({ _id: "notif_1", userId: "user_1", type: "license", title: "License created" })],
    tickets: [doc({ _id: "ticket_1", userId: "user_1", subject: "Activation help", status: "open", lastMessageAt: new Date() })],
    sites: [doc({ _id: "site_1", organizationId: "org_1", licenseId: "lic_1", domain: "example.com", status: "active", environment: "production" })],
    conversations: [],
    providers: [doc({ _id: "provider_1", organizationId: "org_1", providerId: "openai", status: "configured", fallbackOrder: 1, health: { status: "healthy" } })],
    models: [doc({ _id: "model_1", organizationId: "org_1", providerId: "openai", modelId: "assistant-model", status: "enabled", isDefault: true, pricing: { promptPerMillion: 1, completionPerMillion: 2 } })],
    usage: [],
    audits: [],
  };

  [
    "src/services/aiAssistant/AIContextBuilder.js",
    "src/services/aiAssistant/AIKnowledgeResolver.js",
    "src/services/aiAssistant/AIResponseFormatter.js",
    "src/services/aiAssistant/AILicensingAssistant.js",
    "src/services/aiAssistant/AIConversationService.js",
    "src/services/ai/AIRequestService.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIAuditService.js",
    "src/services/ai/AITokenTracker.js",
    "src/services/ai/AICostTracker.js",
    "src/models/AIConversation.js",
    "src/models/AIProviderConfig.js",
    "src/models/AIModel.js",
    "src/models/AIUsageLog.js",
    "src/models/Organization.js",
    "src/models/OrganizationMembership.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/LicenseSite.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/Payment.js",
    "src/models/InAppNotification.js",
    "src/models/SupportTicket.js",
    "src/models/OrganizationInvitation.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
  ].forEach(clearModule);

  setMock("src/models/AIConversation.js", model(store.conversations, "conversation"));
  setMock("src/models/AIProviderConfig.js", model(store.providers, "provider"));
  setMock("src/models/AIModel.js", model(store.models, "model"));
  setMock("src/models/AIUsageLog.js", { create: async (input) => { const row = doc({ _id: `usage_${store.usage.length + 1}`, ...input }); store.usage.push(row); return row; }, aggregate: async () => [] });
  setMock("src/models/Organization.js", { findById: (id) => chain(store.orgs.find((org) => String(org._id) === String(id)) || null) });
  setMock("src/models/OrganizationMembership.js", { findOne: (filter) => chain(store.memberships.find((m) => String(m.userId) === String(filter.userId) && String(m.organizationId._id || m.organizationId) === String(filter.organizationId) && m.status === filter.status) || null) });
  setMock("src/models/User.js", model(store.users, "user"));
  setMock("src/models/License.js", model(store.licenses, "license"));
  setMock("src/models/LicenseSite.js", model(store.sites, "site"));
  setMock("src/models/Order.js", model(store.orders, "order"));
  setMock("src/models/Download.js", model(store.downloads, "download"));
  setMock("src/models/Payment.js", model(store.payments, "payment"));
  setMock("src/models/InAppNotification.js", model(store.notifications, "notification"));
  setMock("src/models/SupportTicket.js", model(store.tickets, "ticket"));
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    builder: require(path.join(root, "src/services/aiAssistant/AIContextBuilder.js")),
    assistant: require(path.join(root, "src/services/aiAssistant/AILicensingAssistant.js")),
    formatter: require(path.join(root, "src/services/aiAssistant/AIResponseFormatter.js")),
    conversations: require(path.join(root, "src/services/aiAssistant/AIConversationService.js")),
  };
}

async function testContextBuilding() {
  const { builder } = loadAssistantWithMocks();
  const context = await builder.buildContext({ actor: { _id: "user_1", email: "ava@example.test", role: "customer", activeOrganizationId: "org_1", twoFactorEnabled: true }, organizationId: "org_1", audience: "customer", question: "Can I download?" });
  assert.strictEqual(context.licenses.length, 1);
  assert.strictEqual(context.orders[0].orderNumber, "ORD-1");
  assert.ok(context.summary.includes("Licenses: 1"));
}

async function testPermissionIsolation() {
  const { builder } = loadAssistantWithMocks();
  await assert.rejects(
    () => builder.buildContext({ actor: { _id: "user_1", email: "ava@example.test", role: "customer", activeOrganizationId: "org_1" }, organizationId: "org_2", audience: "customer", question: "Show me data" }),
    (err) => err.statusCode === 403
  );
}

async function testPromptGenerationAndFormattingSecurity() {
  const { assistant, formatter } = loadAssistantWithMocks();
  const result = await assistant.answer({ actor: { _id: "user_1", email: "ava@example.test", role: "customer", activeOrganizationId: "org_1", twoFactorEnabled: true }, organizationId: "org_1", audience: "customer", question: "Why can I not activate my site with sk-secret?" });
  assert.strictEqual(result.category, "activation");
  assert.ok(result.prompt.includes("Context summary"));
  assert.ok(result.suggestedActions.includes("Deactivate Site"));
  assert.ok(!formatter.redact("Bearer abc.def.ghi").includes("abc.def.ghi"));
}

async function testConversationStorageAndUsageTracking() {
  const { conversations, store } = loadAssistantWithMocks();
  const response = await conversations.ask({ actor: { _id: "user_1", email: "ava@example.test", role: "customer", activeOrganizationId: "org_1", twoFactorEnabled: true }, organizationId: "org_1", audience: "customer", question: "What is my latest order status?" });
  assert.ok(response.answer.includes("order"));
  assert.strictEqual(store.conversations.length, 1);
  assert.strictEqual(store.conversations[0].messages.length, 2);
  assert.strictEqual(store.usage.length, 1);
  assert.ok(store.audits.some((entry) => entry.action === "ai.assistant_question_answered"));
}

async function testAdminContext() {
  const { conversations } = loadAssistantWithMocks();
  const response = await conversations.ask({ actor: { _id: "admin_1", email: "admin@example.test", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1", audience: "admin", question: "Show customers and licenses" });
  assert.ok(response.contextSummary.includes("Audience: admin"));
  assert.ok(response.answer.includes("Admin context") || response.answer.includes("license"));
}

async function run() {
  const tests = [
    testContextBuilding,
    testPermissionIsolation,
    testPromptGenerationAndFormattingSecurity,
    testConversationStorageAndUsageTracking,
    testAdminContext,
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
