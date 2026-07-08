const Integration = require("../../models/Integration");
const registry = require("./IntegrationRegistry");
const HealthService = require("./IntegrationHealthService");
const OutgoingWebhookService = require("./OutgoingWebhookService");
const ExtensionBus = require("./ExtensionBus");
const ApiCapabilityRegistry = require("./ApiCapabilityRegistry");
const { writeAuditLog } = require("../../utils/auditLog");

async function audit({ actor, action, targetId = null, metadata = {}, ip = "", requestId = "" }) {
  await writeAuditLog({ actor, action, targetType: "Integration", targetId, metadata, ip, requestId });
}

async function installedIntegrations() {
  const installed = await Integration.find().lean();
  const byProvider = new Map(installed.map((item) => [item.providerId, item]));
  return registry.list().map((provider) => {
    const record = byProvider.get(provider.id);
    return {
      ...provider,
      installed: Boolean(record),
      status: record?.status || "disabled",
      enabled: Boolean(record?.enabled),
      lastSync: record?.lastSyncAt || null,
      lastSuccessfulSync: record?.lastSuccessfulSyncAt || null,
      lastError: record?.lastError || "",
      health: record?.health || { status: "unknown" },
      configuration: {
        webhookConfigured: Boolean(record?.configuration?.webhookUrl),
        webhookEvents: record?.configuration?.webhookEvents || [],
      },
    };
  });
}

async function configure(providerId, configuration = {}, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const validation = provider.validateConfig(configuration);
  if (!validation.valid) {
    const err = new Error(validation.errors.join("; "));
    err.statusCode = 422;
    throw err;
  }
  const integration = await Integration.findOneAndUpdate(
    { providerId },
    {
      $set: {
        providerId,
        name: provider.name,
        version: provider.version,
        capabilities: provider.capabilities,
        configuration,
        status: "pending",
        lastError: "",
      },
      $setOnInsert: { enabled: false },
    },
    { new: true, upsert: true }
  );
  await audit({ actor, action: "integration.configuration_changed", targetId: integration._id, metadata: { providerId }, ip, requestId });
  return integration;
}

async function setEnabled(providerId, enabled, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const integration = await Integration.findOneAndUpdate(
    { providerId },
    {
      $set: {
        providerId,
        name: provider.name,
        version: provider.version,
        capabilities: provider.capabilities,
        enabled: Boolean(enabled),
        status: enabled ? "pending" : "disabled",
      },
    },
    { new: true, upsert: true }
  );
  await audit({ actor, action: enabled ? "integration.enabled" : "integration.disabled", targetId: integration._id, metadata: { providerId }, ip, requestId });
  return integration;
}

async function testConnection(providerId, { actor, ip, requestId } = {}) {
  const provider = registry.get(providerId);
  const integration = await Integration.findOne({ providerId });
  const result = await provider.testConnection(integration?.configuration || {});
  if (integration) {
    integration.status = result.success ? "connected" : "error";
    integration.lastConnectionTestAt = new Date();
    integration.lastError = result.success ? "" : result.message;
    integration.health = { status: result.success ? "ok" : "error", checkedAt: new Date(), message: result.message };
    await integration.save();
  }
  await audit({ actor, action: "integration.connection_tested", targetId: integration?._id, metadata: { providerId, result }, ip, requestId });
  return result;
}

module.exports = {
  registry,
  health: HealthService,
  webhooks: OutgoingWebhookService,
  extensions: ExtensionBus,
  api: ApiCapabilityRegistry,
  installedIntegrations,
  configure,
  setEnabled,
  testConnection,
};
