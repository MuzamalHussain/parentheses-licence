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
const safeError = (value = "") => String(value).replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[redacted-key]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300);
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
  const missingFields = fields.filter((field) => field.required && !(secretLike(field.key, field) ? secretConfigured[field.key] : configuration[field.key])).map((field) => field.key);
  const configured = missingFields.length === 0;
  return {
    id: provider.id, providerId: provider.id, name: provider.name, version: provider.version, category: provider.category || "General",
    capabilities: provider.capabilities, fields, installed: Boolean(record), status: record?.status || "disabled",
    enabled: Boolean(record?.enabled), lastSync: record?.lastSyncAt || null,
    lastSuccessfulSync: record?.lastSuccessfulSyncAt || null, lastConnectionTestAt: record?.lastConnectionTestAt || null,
    lastSuccessfulConnectionTestAt: record?.lastSuccessfulConnectionTestAt || null,
    lastTestCheckoutAt: record?.lastTestCheckoutAt || null,
    lastConnectionLatencyMs: record?.lastConnectionLatencyMs ?? null, lastError: record?.lastError || "",
    health: record?.health || { status: "unknown" }, configuration, secretConfigured, configured,
    configurationStatus: configured ? "configured" : "unconfigured", missingFields,
    checkoutEligible: Boolean(provider.category === "Payments" && configured && record?.enabled && record?.status === "connected" && record?.health?.status === "ok"),
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
        secretMetadata[key] = { configured: true, configuredAt: new Date(), configuredBy: actor?._id || actor?.id || null, fingerprint: SecretService.fingerprint(value), source: "database" };
        changedSecretFields.push(key);
      }
    } else if (value !== undefined) { configuration[key] = value; changedFields.push(key); }
  }
  const integration = await Integration.findOneAndUpdate({ providerId }, { $set: {
    providerId, name: provider.name, category: provider.category || "General", version: provider.version,
    capabilities: provider.capabilities, configuration, encryptedSecrets, secretMetadata,
    environment: configuration.environment || current?.environment || "default", status: "pending", lastError: "", updatedBy: actor?._id || actor?.id || null,
  }, $setOnInsert: { enabled: false } }, { new: true, upsert: true });
  await audit({ actor, action: provider.category === "Payments" ? (current ? "payment_provider_config_updated" : "payment_provider_config_created") : "integration.configuration_changed", targetId: integration._id,
    metadata: { providerId, changedFields, changedSecretFields }, ip, requestId });
  if (provider.category === "Payments" && changedSecretFields.length) await audit({ actor, action: "payment_provider_secret_replaced", targetId: integration._id, metadata: { providerId, changedSecretFields }, ip, requestId });
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
  if (enabled && provider.category === "Payments") {
    const existing = await Integration.findOne({ providerId });
    if (!existing || existing.status !== "connected" || existing.health?.status !== "ok") {
      const error = new Error("Payment provider must be fully configured and pass its connection and capability test before it can be enabled.");
      error.code = "PROVIDER_UNHEALTHY";
      error.statusCode = 409;
      throw error;
    }
  }
  const integration = await Integration.findOneAndUpdate({ providerId }, { $set: { providerId, name: provider.name,
    category: provider.category || "General", version: provider.version, capabilities: provider.capabilities,
    enabled: Boolean(enabled), status: enabled ? "pending" : "disabled" } }, { new: true, upsert: true });
  await audit({ actor: context.actor, action: provider.category === "Payments" ? (enabled ? "payment_provider_enabled" : "payment_provider_disabled") : (enabled ? "integration.enabled" : "integration.disabled"), targetId: integration._id, metadata: { providerId }, ip: context.ip, requestId: context.requestId });
  return publicRecord(integration.toObject ? integration.toObject() : integration, provider);
}

async function testConnection(providerId, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const integration = await withSecrets(Integration.findOne({ providerId }));
  const started = Date.now();
  let result;
  try { result = await provider.testConnection(await resolveConfiguration(providerId)); }
  catch (error) { result = { success: false, status: error.code === "ENCRYPTION_KEY_NOT_CONFIGURED" ? "configuration_error" : "error", message: safeError(error.message), code: error.code || "CONNECTION_TEST_FAILED" }; }
  const latencyMs = Date.now() - started;
  if (integration) {
    integration.status = result.success ? "connected" : "error"; integration.lastConnectionTestAt = new Date();
    if (result.success) integration.lastSuccessfulConnectionTestAt = integration.lastConnectionTestAt;
    integration.lastConnectionLatencyMs = latencyMs; integration.lastError = result.success ? "" : result.message;
    integration.health = { status: result.success ? "ok" : "error", checkedAt: new Date(), message: result.message };
    await integration.save();
  }
  await audit({ actor, action: provider.category === "Payments" ? "payment_provider_connection_tested" : "integration.connection_tested", targetId: integration?._id,
    metadata: { providerId, success: Boolean(result.success), status: result.status, latencyMs }, ip, requestId });
  return { ...result, latencyMs };
}

module.exports = { registry, health: HealthService, webhooks: OutgoingWebhookService, extensions: ExtensionBus,
  api: ApiCapabilityRegistry, installedIntegrations, configure, resolveConfiguration, setEnabled, testConnection,
  categories: ProviderCatalog.CATEGORIES, encryptionStatus: SecretService.encryptionStatus };
