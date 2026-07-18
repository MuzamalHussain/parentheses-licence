const assert = require("assert");
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/phase16b_test";
process.env.JWT_ACCESS_SECRET = "phase16b_access_secret";
process.env.JWT_REFRESH_SECRET = "phase16b_refresh_secret";
const SettingsService = require("../src/services/settings/SettingsService");
const SettingsCache = require("../src/services/settings/SettingsCache");
const { SettingDefinitionRegistry } = require("../src/services/settings/SettingDefinitionRegistry");
const { registerGeneralSettings, DEFINITIONS } = require("../src/services/settings/GeneralSettingDefinitions");
const { ValidationFailed } = require("../src/services/settings/errors");
const { hasValidSignature } = require("../src/middleware/generalSettingsUpload");
const { requireRole } = require("../src/middleware/auth");

class MemoryRepository {
  constructor() { this.records = new Map(); this.audits = []; this.reads = 0; }
  async findByKey(key) { this.reads += 1; return this.records.get(key) || null; }
  async upsert(record) { const current = this.records.get(record.key); const saved = { ...record, version: (current?.version || 0) + 1 }; this.records.set(record.key, saved); return { record: saved, created: !current }; }
  async audit(event, data) { this.audits.push({ event, ...data }); }
}

function setup() { const definitions = registerGeneralSettings(new SettingDefinitionRegistry()); const repository = new MemoryRepository(); const cache = new SettingsCache({ ttlMs: 60000 }); return { definitions, repository, cache, service: new SettingsService({ definitions, repository, cache, env: {} }) }; }
async function invalid(service, key, value) { await assert.rejects(service.set(key, value), ValidationFailed); }

async function run() {
  const { service, repository, cache } = setup();
  assert.strictEqual(DEFINITIONS.length, 20);
  const group = await service.getGroup("general");
  assert.strictEqual(Object.keys(group).length, 20);
  assert.strictEqual(group["general.portalName"], "Parentheses Licence");

  await service.set("general.portalName", "Customer Portal", { actorId: null, auditEvent: "general.updated" });
  await service.set("general.companyName", "Example Company", { actorId: null, auditEvent: "general.updated" });
  assert.strictEqual(await service.get("general.portalName"), "Customer Portal");
  assert.strictEqual(await service.get("general.companyName"), "Example Company");
  assert.ok(repository.audits.some((entry) => entry.event === "general.updated" && entry.metadata.oldValue === "Parentheses Licence" && entry.metadata.newValue === "Customer Portal"));

  await invalid(service, "general.supportEmail", "invalid-email");
  await invalid(service, "general.websiteUrl", "http://insecure.example.com");
  await invalid(service, "general.timezone", "Mars/Olympus");
  await invalid(service, "general.defaultCurrency", "US");
  await invalid(service, "general.portalName", "<b>Injected</b>");
  assert.strictEqual(await service.set("general.phoneNumber", "+1 (202) 555-0100"), "+12025550100");

  await service.get("general.defaultCurrency");
  const sizeBefore = cache.stats().size;
  await service.set("general.portalName", "Updated Again", { auditEvent: "general.updated" });
  assert.strictEqual(cache.entries.has("general.portalName"), false);
  assert.strictEqual(cache.entries.has("general.defaultCurrency"), true);
  assert.ok(cache.stats().size < sizeBefore + 1);

  const png = { buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) };
  const ico = { buffer: Buffer.from([0, 0, 1, 0, 1, 0]) };
  assert.strictEqual(hasValidSignature("logo", png), true);
  assert.strictEqual(hasValidSignature("favicon", ico), true);
  assert.strictEqual(hasValidSignature("logo", { buffer: Buffer.from("not-image") }), false);
  await service.set("general.brandLogo", "/api/v1/admin/settings/general/assets/logo-0123456789abcdef0123456789abcdef.png", { auditEvent: "general.logo.updated" });
  await service.set("general.favicon", "/api/v1/admin/settings/general/assets/favicon-0123456789abcdef0123456789abcdef.ico", { auditEvent: "general.favicon.updated" });
  assert.ok(repository.audits.some((entry) => entry.event === "general.logo.updated"));
  assert.ok(repository.audits.some((entry) => entry.event === "general.favicon.updated"));

  let allowed = false; requireRole("admin")({ user: { role: "admin" } }, {}, () => { allowed = true; }); assert.strictEqual(allowed, true);
  let denied; requireRole("admin")({ user: { role: "support" } }, {}, (error) => { denied = error; }); assert.strictEqual(denied.statusCode, 403);

  const router = require("../src/routes/adminSettings");
  const paths = router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
  for (const endpoint of ["get /general", "patch /general", "post /general/logo", "post /general/favicon"]) assert.ok(paths.includes(endpoint), `Missing ${endpoint}`);
  console.log("PASS Phase 16B General Settings tests");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
