process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15g_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15g_access_secret_minimum_32_chars";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15g_refresh_secret_minimum_32_chars";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

const Manifest = require("../src/services/marketplace/ExtensionManifestService");
const Registry = require("../src/services/marketplace/ExtensionRegistry");
const Lifecycle = require("../src/services/marketplace/ExtensionLifecycleManager");
const Permissions = require("../src/services/marketplace/ExtensionPermissionService");
const Compatibility = require("../src/services/marketplace/ExtensionCompatibilityService");
const Loader = require("../src/services/marketplace/ExtensionLoader");
const SDK = require("../src/services/marketplace/ExtensionSDK");
const Manager = require("../src/services/marketplace/ExtensionManager");

const sampleManifest = {
  id: "vendor.sample-extension",
  name: "Sample Extension",
  version: "1.0.0",
  author: "Vendor",
  description: "A sample private marketplace extension.",
  entryPoint: "index.js",
  permissions: ["licenses.read", "analytics.read", "webhooks.write"],
  dependencies: [],
  requiredModules: ["licensing", "analytics", "webhooks"],
  platformVersion: ">=1.0.0",
  sdkVersion: "v1",
  publisher: { id: "vendor", verified: false },
};

function reset() {
  Registry.resetForTests();
}

function testManifestValidationAndPermissions() {
  const validation = Manifest.validate(sampleManifest);
  assert.strictEqual(validation.valid, true);
  const invalid = Manifest.validate({ ...sampleManifest, id: "../bad", entryPoint: "../index.js" });
  assert.strictEqual(invalid.valid, false);
  const permissions = Permissions.validatePermissions(["licenses.read", "root.access"]);
  assert.strictEqual(permissions.valid, false);
  assert.ok(permissions.invalid.includes("root.access"));
}

async function testMarketplaceLifecycle() {
  const added = Manager.addToCatalog(sampleManifest);
  assert.strictEqual(added.valid, true);
  const installed = await Lifecycle.install(sampleManifest.id, { actor: { role: "admin" } });
  assert.strictEqual(installed.status, "installed");
  const enabled = await Lifecycle.enable(sampleManifest.id, { actor: { role: "admin" } });
  assert.strictEqual(enabled.enabled, true);
  const updated = await Lifecycle.update(sampleManifest.id, { version: "1.0.1" }, { actor: { role: "admin" } });
  assert.strictEqual(updated.status, "updated");
  const rolledBack = await Lifecycle.rollback(sampleManifest.id, { actor: { role: "admin" } });
  assert.strictEqual(rolledBack.status, "rolled_back");
}

function testCompatibilityLoaderAndSdk() {
  const extension = Registry.getInstalled(sampleManifest.id);
  const compatibility = Compatibility.validate(extension, Registry.listInstalled());
  assert.strictEqual(compatibility.compatible, true);
  const loaded = Loader.load(extension, Registry.listInstalled());
  assert.strictEqual(loaded.sandboxed, true);
  assert.ok(loaded.integrity);
  const sdk = SDK.describe();
  assert.ok(sdk.modules.some((module) => module.id === "licensing"));
  const ctx = SDK.createContext(extension);
  assert.strictEqual(ctx.can("licenses.read"), true);
}

async function testPermissionGrantRevokeAndDashboard() {
  const granted = await Lifecycle.grantPermission(sampleManifest.id, ["notifications.read"], { actor: { role: "admin" } });
  assert.ok(granted.permissions.includes("notifications.read"));
  const revoked = await Lifecycle.revokePermission(sampleManifest.id, ["notifications.read"], { actor: { role: "admin" } });
  assert.ok(!revoked.permissions.includes("notifications.read"));
  const dashboard = await Manager.dashboard();
  assert.ok(dashboard.installed.length >= 1);
  assert.ok(dashboard.catalog.length >= 1);
  assert.strictEqual(dashboard.security.unrestrictedAccessAllowed, false);
  assert.strictEqual(dashboard.performance.lazyLoading, true);
}

async function run() {
  reset();
  testManifestValidationAndPermissions();
  await testMarketplaceLifecycle();
  testCompatibilityLoaderAndSdk();
  await testPermissionGrantRevokeAndDashboard();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15G marketplace extensions developer ecosystem tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
