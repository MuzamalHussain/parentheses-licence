const modules = [
  { id: "authentication", methods: ["getCurrentUser", "requirePermission"], permission: "developer_api.read" },
  { id: "licensing", methods: ["getLicense", "listLicenses", "validateLicense"], permission: "licenses.read" },
  { id: "organizations", methods: ["getOrganization", "listMemberships"], permission: "organizations.read" },
  { id: "payments", methods: ["listPayments"], permission: "payments.read" },
  { id: "notifications", methods: ["sendNotification", "listTemplates"], permission: "notifications.write" },
  { id: "ai", methods: ["askAssistant", "summarize"], permission: "ai.use" },
  { id: "webhooks", methods: ["registerWebhook", "dispatchWebhook"], permission: "webhooks.write" },
  { id: "settings", methods: ["readSetting", "writeSetting"], permission: "settings.read" },
  { id: "analytics", methods: ["getDashboard", "queryMetric"], permission: "analytics.read" },
  { id: "storage", methods: ["readObject", "writeObject"], permission: "storage.read" },
];

function describe() {
  return {
    sdkVersion: "v1",
    apiVersion: "v1",
    modules,
    compatibilityMetadata: {
      supportsBrowser: false,
      supportsNode: true,
      sandboxRequired: true,
      unrestrictedAccess: false,
    },
  };
}

function createContext(extension) {
  const granted = new Set(extension.permissions || []);
  return {
    extensionId: extension.id,
    sdkVersion: "v1",
    can(permission) {
      return granted.has(permission);
    },
    modules: modules.map((module) => ({ ...module, available: granted.has(module.permission) })),
  };
}

module.exports = { createContext, describe };
