const assert = require("assert");
const SettingsService = require("../src/services/settings/SettingsService");
const SettingsCache = require("../src/services/settings/SettingsCache");
const { SettingDefinitionRegistry } = require("../src/services/settings/SettingDefinitionRegistry");
const validators = require("../src/services/settings/SettingValidators");
const { SettingNotFound, ValidationFailed } = require("../src/services/settings/errors");

class MemoryRepository {
  constructor(seed = []) { this.records = new Map(seed.map((item) => [item.key, { ...item }])); this.audits = []; this.reads = 0; }
  async findByKey(key) { this.reads += 1; return this.records.get(key) || null; }
  async upsert(record) { const current = this.records.get(record.key); const saved = { ...record, version: (current?.version || 0) + 1 }; this.records.set(record.key, saved); return { record: saved, created: !current }; }
  async remove(key) { const record = this.records.get(key); this.records.delete(key); return record || null; }
  async audit(event, data) { this.audits.push({ event, ...data }); }
}

function setup(seed = [], env = {}) {
  const definitions = new SettingDefinitionRegistry();
  definitions.register({ key: "general.title", group: "general", type: "string", default: "Default title", envKey: "APP_TITLE" });
  definitions.register({ key: "featureFlags.enabled", group: "featureFlags", type: "boolean", default: false, envKey: "FEATURE_ENABLED" });
  definitions.register({ key: "downloads.limit", group: "downloads", type: "number", default: 10, envKey: "DOWNLOAD_LIMIT" });
  definitions.register({ key: "general.url", group: "general", type: "url", default: "https://example.test" });
  definitions.register({ key: "security.apiKey", group: "security", type: "secret", encrypted: true, default: undefined });
  const repository = new MemoryRepository(seed);
  const encryption = { encrypt: (value) => ({ cipher: Buffer.from(value).toString("base64") }), decrypt: (value) => Buffer.from(value.cipher, "base64").toString(), mask: () => "********", rotateKey: (payload, methods) => methods.encryptWith(methods.decryptWith(payload)) };
  return { service: new SettingsService({ repository, definitions, cache: new SettingsCache({ ttlMs: 60000 }), encryption, env }), repository, definitions, encryption };
}

const tests = {
  async retrievalAndDefault() { const { service } = setup(); assert.strictEqual(await service.get("general.title"), "Default title"); },
  async environmentFallbackAndParsing() { const { service } = setup([], { APP_TITLE: "Env title", FEATURE_ENABLED: "false", DOWNLOAD_LIMIT: "25" }); assert.strictEqual(await service.get("general.title"), "Env title"); assert.strictEqual(await service.get("featureFlags.enabled"), false); assert.strictEqual(await service.get("downloads.limit"), 25); },
  async databasePriority() { const { service } = setup([{ key: "general.title", group: "general", value: "Database title", version: 3 }], { APP_TITLE: "Env title" }); const result = await service.get("general.title", { withMetadata: true }); assert.strictEqual(result.value, "Database title"); assert.strictEqual(result.source, "database"); assert.strictEqual(result.version, 3); },
  async runtimeOverridePriority() { const { service } = setup([{ key: "general.title", group: "general", value: "Database" }], { APP_TITLE: "Env" }); service.setOverride("general.title", "Override"); assert.strictEqual(await service.get("general.title"), "Override"); service.removeOverride("general.title"); assert.strictEqual(await service.get("general.title"), "Database"); },
  async cacheHitAndInvalidation() { const { service, repository } = setup(); await service.get("general.title"); await service.get("general.title"); assert.strictEqual(repository.reads, 1); assert.strictEqual(service.cacheStats().hits, 1); service.clearCache({ keys: ["general.title"] }); await service.get("general.title"); assert.strictEqual(repository.reads, 2); },
  async groupCacheInvalidation() { const { service, repository } = setup(); await service.getGroup("general"); const reads = repository.reads; service.clearCache({ group: "general" }); await service.getGroup("general"); assert.strictEqual(repository.reads, reads + 2); },
  async writesRemovalAndAudit() { const { service, repository } = setup(); await service.set("general.title", "Changed"); assert.strictEqual(await service.get("general.title"), "Changed"); assert.ok(repository.audits.some((item) => item.event === "setting.created")); assert.strictEqual(await service.remove("general.title"), true); },
  async validation() { const { service } = setup(); await assert.rejects(service.set("downloads.limit", "not-number"), ValidationFailed); await assert.rejects(service.set("general.url", "not a url"), ValidationFailed); },
  async encryptedSetting() { const { service, repository } = setup(); await service.set("security.apiKey", "secret-value"); assert.strictEqual(repository.records.get("security.apiKey").value, null); assert.ok(repository.records.get("security.apiKey").encryptedValue); assert.strictEqual(await service.get("security.apiKey"), "secret-value"); },
  async groupAndMany() { const { service } = setup([], { APP_TITLE: "Grouped" }); const group = await service.getGroup("general"); assert.strictEqual(group["general.title"], "Grouped"); assert.ok(group["general.url"]); const many = await service.getMany(["general.title", "downloads.limit"]); assert.strictEqual(many["downloads.limit"], 10); },
  async missingSetting() { const { service } = setup(); await assert.rejects(service.get("unknown.key"), SettingNotFound); assert.strictEqual(await service.has("unknown.key"), false); },
  async customValidator() { validators.register("even", (value) => Number(value) % 2 === 0 ? { valid: true, value: Number(value) } : { valid: false, message: "must be even" }); const { service, definitions } = setup(); definitions.register({ key: "general.even", group: "general", type: "number", validator: "even", default: 2 }); assert.strictEqual(await service.get("general.even"), 2); await assert.rejects(service.set("general.even", 3), ValidationFailed); },
  async exportImportAndReload() { const { service, repository } = setup(); await service.set("general.title", "Exported"); const payload = await service.export(); assert.strictEqual(payload.schemaVersion, 1); const { service: target } = setup(); const result = await target.import(payload); assert.ok(result.imported >= 1); assert.strictEqual(await target.get("general.title"), "Exported"); await target.reload(); assert.ok(repository.audits.some((item) => item.event === "setting.exported")); },
};

(async () => { for (const [name, test] of Object.entries(tests)) { await test(); console.log(`PASS ${name}`); } })().catch((error) => { console.error(error); process.exitCode = 1; });
