const Integration = require("../../models/Integration");
const registry = require("./IntegrationRegistry");
const ProviderCatalog = require("./ProviderCatalog");
const SecretService = require("../security/IntegrationSecretService");
const HealthService = require("./IntegrationHealthService");
const OutgoingWebhookService = require("./OutgoingWebhookService");
const ExtensionBus = require("./ExtensionBus");
const ApiCapabilityRegistry = require("./ApiCapabilityRegistry");
const { writeAuditLog } = require("../../utils/auditLog");

async function audit({ actor, action, targetId = null, metadata = {}, ip = "", requestId = "" }) {
  await writeAuditLog({ actor, action, targetType: "Integration", targetId, metadata, ip, requestId });
}

const secretLike = (key, field) => Boolean(field?.secret || /(secret|password|token|api.?key|private.?key|salt)$/i.test(key));
const isProvided = (value) => value !== undefined && value !== "" && value !== "********";
const withSecrets = (query) => (query && typeof query.select === "function" ? query.select("+encryptedSecrets") : query);
const asLean = async (query) => {
  const selected = withSecrets(query);
  return selected && typeof selected.lean === "function" ? selected.lean() : selected;
};

function publicRecord(record, provider) {
  const fields = provider.fields || [];
  const configuration = { ...(record?.configuration || {}) };
  fields.filter((f) => secretLike(f.key, f)).forEach((f) => delete configuration[f.key]);
  const secretConfigured = {};
  fields.filter((f) => secretLike(f.key, f)).forEach((f) => {
    secretConfigured[f.key] = Boolean(record?.secretMetadata?.[f.key]?.configured || (f.env && process.env[f.env]));
  });
  return {
    id: provider.id, providerId: provider.id, name: provider.name, version: provider.version, category: provider.category || "General",
    capabilities: provider.capabilities, fields, installed: Boolean(record), status: record?.status || "disabled",
    enabled: Boolean(record?.enabled), lastSync: record?.lastSyncAt || null,
    lastSuccessfulSync: record?.lastSuccessfulSyncAt || null, lastConnectionTestAt: record?.lastConnectionTestAt || null,
    lastSuccessfulConnectionTestAt: record?.lastSuccessfulConnectionTestAt || null,
    lastConnectionLatencyMs: record?.lastConnectionLatencyMs ?? null, lastError: record?.lastError || "",
    health: record?.health || { status: "unknown" }, configuration, secretConfigured,
  };
}

async function installedIntegrations() {
  const installed = await Integration.find().lean();
  const byProvider = new Map(installed.map((item) => [item.providerId, item]));
  return registry.list().map((provider) => publicRecord(byProvider.get(provider.id), provider));
}

async function configure(providerId, incoming = {}, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const validation = provider.validateConfig(incoming);
  if (!validation.valid) { const err = new Error(validation.errors.join("; ")); err.statusCode = 422; throw err; }
  const current = await withSecrets(Integration.findOne({ providerId }));
  const configuration = { ...(current?.configuration || {}) };
  const encryptedSecrets = { ...(current?.encryptedSecrets || {}) };
  const secretMetadata = { ...(current?.secretMetadata || {}) };
  const changedFields = [];
  const changedSecretFields = [];
  const definitions = new Map((provider.fields || []).map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(incoming)) {
    if (secretLike(key, definitions.get(key))) {
      delete configuration[key];
      if (value === null) { delete encryptedSecrets[key]; delete secretMetadata[key]; changedSecretFields.push(key); }
      else if (isProvided(value)) {
        encryptedSecrets[key] = SecretService.encrypt(value);
        secretMetadata[key] = { configured: true, configuredAt: new Date(), fingerprint: SecretService.fingerprint(value), source: "database" };
        changedSecretFields.push(key);
      }
    } else if (value !== undefined) { configuration[key] = value; changedFields.push(key); }
  }
  const integration = await Integration.findOneAndUpdate({ providerId }, { $set: {
    providerId, name: provider.name, category: provider.category || "General", version: provider.version,
    capabilities: provider.capabilities, configuration, encryptedSecrets, secretMetadata,
    environment: configuration.environment || current?.environment || "default", status: "pending", lastError: "",
  }, $setOnInsert: { enabled: false } }, { new: true, upsert: true });
  await audit({ actor, action: "integration.configuration_changed", targetId: integration._id,
    metadata: { providerId, changedFields, changedSecretFields }, ip, requestId });
  return publicRecord(integration.toObject ? integration.toObject() : integration, provider);
}

async function resolveConfiguration(providerId) {
  const provider = registry.get(providerId);
  const record = await asLean(Integration.findOne({ providerId }));
  const resolved = { ...(record?.configuration || {}) };
  for (const field of provider.fields || []) {
    if (!isProvided(resolved[field.key]) && field.env && isProvided(process.env[field.env])) resolved[field.key] = process.env[field.env];
    if (secretLike(field.key, field)) {
      if (record?.encryptedSecrets?.[field.key]) resolved[field.key] = SecretService.decrypt(record.encryptedSecrets[field.key]);
      else if (field.env && isProvided(process.env[field.env])) resolved[field.key] = process.env[field.env];
      else delete resolved[field.key];
    }
  }
  return resolved;
}

async function setEnabled(providerId, enabled, context = {}) {
  const provider = registry.get(providerId);
  const integration = await Integration.findOneAndUpdate({ providerId }, { $set: { providerId, name: provider.name,
    category: provider.category || "General", version: provider.version, capabilities: provider.capabilities,
    enabled: Boolean(enabled), status: enabled ? "pending" : "disabled" } }, { new: true, upsert: true });
  await audit({ actor: context.actor, action: enabled ? "integration.enabled" : "integration.disabled", targetId: integration._id, metadata: { providerId }, ip: context.ip, requestId: context.requestId });
  return publicRecord(integration.toObject ? integration.toObject() : integration, provider);
}

async function testConnection(providerId, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const integration = await withSecrets(Integration.findOne({ providerId }));
  const started = Date.now();
  let result;
  try { result = await provider.testConnection(await resolveConfiguration(providerId)); }
  catch (error) { result = { success: false, status: error.code === "ENCRYPTION_KEY_NOT_CONFIGURED" ? "configuration_error" : "error", message: error.message }; }
  const latencyMs = Date.now() - started;
  if (integration) {
    integration.status = result.success ? "connected" : "error"; integration.lastConnectionTestAt = new Date();
    if (result.success) integration.lastSuccessfulConnectionTestAt = integration.lastConnectionTestAt;
    integration.lastConnectionLatencyMs = latencyMs; integration.lastError = result.success ? "" : result.message;
    integration.health = { status: result.success ? "ok" : "error", checkedAt: new Date(), message: result.message };
    await integration.save();
  }
  await audit({ actor, action: "integration.connection_tested", targetId: integration?._id,
    metadata: { providerId, success: Boolean(result.success), status: result.status, latencyMs }, ip, requestId });
  return { ...result, latencyMs };
}

module.exports = { registry, health: HealthService, webhooks: OutgoingWebhookService, extensions: ExtensionBus,
  api: ApiCapabilityRegistry, installedIntegrations, configure, resolveConfiguration, setEnabled, testConnection,
  categories: ProviderCatalog.CATEGORIES, encryptionStatus: SecretService.encryptionStatus };
