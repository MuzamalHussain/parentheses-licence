const { getConfig } = require("../../config/env");

const environments = new Map();

const defaults = [
  { id: "local", name: "Local", promotionOrder: 0, requiresApproval: false },
  { id: "development", name: "Development", promotionOrder: 1, requiresApproval: false },
  { id: "testing", name: "Testing", promotionOrder: 2, requiresApproval: false },
  { id: "staging", name: "Staging", promotionOrder: 3, requiresApproval: true },
  { id: "production", name: "Production", promotionOrder: 4, requiresApproval: true },
];

function secretRef(name, configured) {
  return { name, configured: Boolean(configured), value: configured ? "[SECRET_REF]" : "" };
}

function currentEnvironmentConfig() {
  const config = getConfig();
  return {
    environmentVariables: {
      NODE_ENV: config.app.nodeEnv,
      APP_ENV: config.app.appEnv,
      DEPLOYMENT_TARGET: config.app.deploymentTarget,
      CLIENT_URL: config.app.clientUrl,
      STORAGE_PROVIDER: config.storage.provider,
      REDIS_ENABLED: config.security.redisEnabled,
    },
    secretReferences: [
      secretRef("MONGO_URI", config.database.uri),
      secretRef("JWT_ACCESS_SECRET", config.auth.accessSecret),
      secretRef("JWT_REFRESH_SECRET", config.auth.refreshSecret),
      secretRef("SMTP_PASS", config.email.pass),
      secretRef("STRIPE_SECRET_KEY", config.payments.stripeSecretKey),
    ],
    featureFlags: config.features,
    aiConfiguration: { providerRegistry: "configured_by_ai_platform", secretsRedacted: true },
    storageConfiguration: { provider: config.storage.provider, uploadRoot: config.storage.uploadRoot || "uploads" },
    emailConfiguration: { provider: config.email.provider, enabled: config.email.enabled },
  };
}

function listEnvironments() {
  defaults.forEach((definition) => {
    if (!environments.has(definition.id)) {
      environments.set(definition.id, {
        ...definition,
        status: definition.id === currentEnvironmentConfig().environmentVariables.APP_ENV ? "active" : "available",
        configuration: currentEnvironmentConfig(),
        blueGreen: { blue: "current", green: "standby", trafficSwitching: "foundation" },
        updatedAt: new Date().toISOString(),
      });
    }
  });
  return Array.from(environments.values()).sort((a, b) => a.promotionOrder - b.promotionOrder);
}

function getEnvironment(id) {
  return listEnvironments().find((environment) => environment.id === id) || null;
}

function updateEnvironment(id, patch = {}) {
  const existing = getEnvironment(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...patch,
    configuration: {
      ...existing.configuration,
      ...(patch.configuration || {}),
      secretReferences: existing.configuration.secretReferences,
    },
    updatedAt: new Date().toISOString(),
  };
  environments.set(id, updated);
  return updated;
}

function promotionPath(from, to) {
  const list = listEnvironments();
  const start = list.find((item) => item.id === from);
  const end = list.find((item) => item.id === to);
  if (!start || !end) return [];
  return list.filter((item) => item.promotionOrder >= start.promotionOrder && item.promotionOrder <= end.promotionOrder);
}

function resetForTests() {
  environments.clear();
}

module.exports = { currentEnvironmentConfig, getEnvironment, listEnvironments, promotionPath, resetForTests, updateEnvironment };
