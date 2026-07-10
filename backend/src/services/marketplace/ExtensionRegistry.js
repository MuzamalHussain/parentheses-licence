const Manifest = require("./ExtensionManifestService");
const Compatibility = require("./ExtensionCompatibilityService");
const Permissions = require("./ExtensionPermissionService");

const catalog = new Map();
const installed = new Map();

const defaults = [
  {
    id: "parentheses.slack-notifications",
    name: "Slack Notifications",
    version: "0.1.0",
    author: "Parentheses",
    description: "Send operational notifications to Slack-compatible channels.",
    entryPoint: "index.js",
    permissions: ["notifications.read", "notifications.write", "webhooks.write"],
    dependencies: [],
    requiredModules: ["notifications", "webhooks"],
    platformVersion: ">=1.0.0",
    sdkVersion: "v1",
    publisher: { id: "parentheses", verified: true },
  },
  {
    id: "parentheses.analytics-export",
    name: "Analytics Export",
    version: "0.1.0",
    author: "Parentheses",
    description: "Export analytics summaries for external BI tools.",
    entryPoint: "index.js",
    permissions: ["analytics.read", "developer_api.read"],
    dependencies: [],
    requiredModules: ["analytics", "developer_api"],
    platformVersion: ">=1.0.0",
    sdkVersion: "v1",
    publisher: { id: "parentheses", verified: true },
  },
];

function ensureDefaults() {
  defaults.forEach((extension) => {
    const { manifest } = Manifest.validate(extension);
    if (!catalog.has(manifest.id)) catalog.set(manifest.id, { ...manifest, health: { status: "available" }, updateAvailable: false });
  });
}

function addToCatalog(input) {
  const validation = Manifest.validate(input);
  if (!validation.valid) return { valid: false, errors: validation.errors };
  const permissionValidation = Permissions.validatePermissions(validation.manifest.permissions);
  if (!permissionValidation.valid) return { valid: false, errors: permissionValidation.invalid.map((item) => `permission_invalid:${item}`) };
  catalog.set(validation.manifest.id, { ...validation.manifest, health: { status: "available" }, updateAvailable: false });
  return { valid: true, extension: catalog.get(validation.manifest.id) };
}

function browse() {
  ensureDefaults();
  return Array.from(catalog.values()).map((extension) => ({
    ...extension,
    installed: installed.has(extension.id),
    installedStatus: installed.get(extension.id)?.status || "not_installed",
  }));
}

function getCatalog(id) {
  ensureDefaults();
  return catalog.get(id) || null;
}

function install(extension) {
  installed.set(extension.id, {
    ...extension,
    status: "installed",
    enabled: false,
    installedAt: new Date().toISOString(),
    health: { status: "ok", checkedAt: new Date().toISOString(), message: "Extension installed." },
  });
  return installed.get(extension.id);
}

function updateInstalled(id, patch = {}) {
  const current = installed.get(id);
  if (!current) return null;
  installed.set(id, { ...current, ...patch, updatedAt: new Date().toISOString() });
  return installed.get(id);
}

function remove(id) {
  const current = installed.get(id);
  installed.delete(id);
  return current;
}

function listInstalled() {
  return Array.from(installed.values()).map((extension) => ({
    ...extension,
    compatibility: Compatibility.validate(extension, Array.from(installed.values())),
  }));
}

function getInstalled(id) {
  return installed.get(id) || null;
}

function resetForTests() {
  catalog.clear();
  installed.clear();
}

module.exports = { addToCatalog, browse, getCatalog, getInstalled, install, listInstalled, remove, resetForTests, updateInstalled };
