const Integration = require("../../models/Integration");
const registry = require("./IntegrationRegistry");

async function getHealth(providerId) {
  const provider = registry.get(providerId);
  const integration = await Integration.findOne({ providerId }).lean();
  const health = await provider.health(integration?.configuration || {}, integration);
  return {
    providerId,
    name: provider.name,
    version: provider.version,
    connectionStatus: integration?.status || "disabled",
    enabled: Boolean(integration?.enabled),
    lastSuccessfulSync: integration?.lastSuccessfulSyncAt || null,
    lastSync: integration?.lastSyncAt || null,
    lastError: integration?.lastError || health.lastError || "",
    health,
  };
}

async function getAllHealth() {
  const rows = [];
  for (const provider of registry.list()) rows.push(await getHealth(provider.id));
  return rows;
}

module.exports = { getHealth, getAllHealth };
