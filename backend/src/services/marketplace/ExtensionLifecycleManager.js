const Registry = require("./ExtensionRegistry");
const Loader = require("./ExtensionLoader");
const Permissions = require("./ExtensionPermissionService");
const { writeAuditLog } = require("../../utils/auditLog");

async function audit(action, { actor, targetId, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({ actor, action, targetType: "Extension", targetId, metadata, ip, requestId });
}

async function install(id, context = {}) {
  const extension = Registry.getCatalog(id);
  if (!extension) throw new Error("Extension was not found in the catalog.");
  const loaded = Loader.load(extension, Registry.listInstalled());
  if (!loaded.compatibility.compatible) {
    const err = new Error(`Extension is not compatible: ${loaded.compatibility.errors.join(", ")}`);
    err.statusCode = 422;
    throw err;
  }
  const installed = Registry.install({ ...extension, load: loaded });
  await audit("extension.installed", { ...context, targetId: installed.id, metadata: { version: installed.version } });
  return installed;
}

async function enable(id, context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, { enabled: true, status: "enabled", enabledAt: new Date().toISOString() });
  await audit("extension.enabled", { ...context, targetId: id });
  return updated;
}

async function disable(id, context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, { enabled: false, status: "disabled", disabledAt: new Date().toISOString() });
  await audit("extension.disabled", { ...context, targetId: id });
  return updated;
}

async function update(id, patch = {}, context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, { ...patch, status: "updated", rollbackAvailable: true });
  await audit("extension.updated", { ...context, targetId: id, metadata: { patch: Object.keys(patch) } });
  return updated;
}

async function rollback(id, context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, { status: "rolled_back", enabled: false });
  await audit("extension.rollback", { ...context, targetId: id });
  return updated;
}

async function uninstall(id, context = {}) {
  const removed = Registry.remove(id);
  if (!removed) throw new Error("Extension is not installed.");
  await audit("extension.removed", { ...context, targetId: id });
  return removed;
}

async function grantPermission(id, permissions = [], context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, Permissions.grant(extension, permissions));
  await audit("extension.permission_granted", { ...context, targetId: id, metadata: { permissions } });
  return updated;
}

async function revokePermission(id, permissions = [], context = {}) {
  const extension = Registry.getInstalled(id);
  if (!extension) throw new Error("Extension is not installed.");
  const updated = Registry.updateInstalled(id, Permissions.revoke(extension, permissions));
  await audit("extension.permission_revoked", { ...context, targetId: id, metadata: { permissions } });
  return updated;
}

module.exports = { disable, enable, grantPermission, install, revokePermission, rollback, uninstall, update };
