const allowedPermissions = [
  "licenses.read", "licenses.write",
  "orders.read", "orders.write",
  "organizations.read", "organizations.write",
  "ai.use", "ai.admin",
  "notifications.read", "notifications.write",
  "analytics.read",
  "webhooks.read", "webhooks.write",
  "settings.read", "settings.write",
  "developer_api.read", "developer_api.write",
  "storage.read", "storage.write",
  "payments.read",
];

function validatePermissions(permissions = []) {
  const invalid = permissions.filter((permission) => !allowedPermissions.includes(permission));
  return {
    valid: invalid.length === 0,
    invalid,
    permissions: permissions.filter((permission) => allowedPermissions.includes(permission)),
  };
}

function hasPermission(extension, permission) {
  return Boolean(extension?.permissions?.includes(permission));
}

function grant(extension, permissions = []) {
  const validation = validatePermissions(permissions);
  const next = new Set([...(extension.permissions || []), ...validation.permissions]);
  return { ...extension, permissions: Array.from(next).sort(), permissionValidation: validation };
}

function revoke(extension, permissions = []) {
  const remove = new Set(permissions);
  return { ...extension, permissions: (extension.permissions || []).filter((permission) => !remove.has(permission)) };
}

function summary(extensions = []) {
  return extensions.map((extension) => ({
    id: extension.id,
    permissions: extension.permissions || [],
    count: extension.permissions?.length || 0,
    sandboxed: true,
    unrestrictedAccess: false,
  }));
}

module.exports = { allowedPermissions, grant, hasPermission, revoke, summary, validatePermissions };
