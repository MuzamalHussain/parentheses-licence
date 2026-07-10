const Registry = require("./ExtensionRegistry");
const Lifecycle = require("./ExtensionLifecycleManager");
const Permissions = require("./ExtensionPermissionService");
const SDK = require("./ExtensionSDK");

function developerDocs() {
  return {
    sdkDocumentation: true,
    apiExplorer: true,
    extensionTemplates: [
      { id: "notification-extension", name: "Notification Extension", files: ["manifest.json", "index.js"] },
      { id: "analytics-extension", name: "Analytics Extension", files: ["manifest.json", "index.js"] },
    ],
    publishingGuide: "Prepare a manifest, request permissions, validate compatibility, and submit to a private catalog.",
    versioningGuide: "Use semantic versioning and declare platformVersion and sdkVersion in every manifest.",
  };
}

async function dashboard() {
  const installed = Registry.listInstalled();
  const catalog = Registry.browse();
  return {
    generatedAt: new Date().toISOString(),
    installed,
    catalog,
    compatibilityWarnings: installed.flatMap((extension) => (extension.compatibility?.warnings || []).map((warning) => ({ extensionId: extension.id, warning }))),
    availableUpdates: installed.filter((extension) => extension.updateAvailable),
    health: installed.map((extension) => ({ id: extension.id, health: extension.health || { status: "unknown" } })),
    permissionSummary: Permissions.summary(installed),
    sdk: SDK.describe(),
    developerPortal: developerDocs(),
    security: {
      sandboxingFoundation: true,
      permissionIsolation: true,
      organizationIsolation: true,
      unrestrictedAccessAllowed: false,
      signedExtensionsFoundation: true,
    },
    performance: {
      lazyLoading: true,
      extensionCaching: true,
      dependencyResolution: true,
      backgroundValidation: true,
    },
  };
}

module.exports = {
  addToCatalog: Registry.addToCatalog,
  dashboard,
  lifecycle: Lifecycle,
  registry: Registry,
  sdk: SDK,
};
