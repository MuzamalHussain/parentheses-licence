const RESOURCES = [
  "organization",
  "members",
  "products",
  "versions",
  "licenses",
  "orders",
  "payments",
  "downloads",
  "notifications",
  "analytics",
  "api",
  "webhooks",
  "settings",
  "identity",
  "compliance",
  "integrations",
  "developer_portal",
];

const ACTIONS = ["read", "create", "update", "delete", "manage", "approve", "export"];

const RESOURCE_PERMISSIONS = RESOURCES.flatMap((resource) =>
  ACTIONS.map((action) => ({
    key: `${resource}.${action}`,
    resource,
    action,
    label: `${resource.replace(/_/g, " ")} ${action}`,
  }))
);

const CUSTOM_PERMISSIONS = [
  { key: "ai.use", resource: "ai", action: "use", label: "ai use" },
  { key: "ai.admin", resource: "ai", action: "admin", label: "ai admin" },
  { key: "ai.prompt.manage", resource: "ai", action: "prompt.manage", label: "ai prompt manage" },
  { key: "ai.model.manage", resource: "ai", action: "model.manage", label: "ai model manage" },
  { key: "ai.provider.manage", resource: "ai", action: "provider.manage", label: "ai provider manage" },
  { key: "ai.analytics.read", resource: "ai", action: "analytics.read", label: "ai analytics read" },
  { key: "ai.security.read", resource: "ai", action: "security.read", label: "ai security read" },
  { key: "ai.workflow.manage", resource: "ai", action: "workflow.manage", label: "ai workflow manage" },
  { key: "ai.operations.read", resource: "ai", action: "operations.read", label: "ai operations read" },
  { key: "ai.release.read", resource: "ai", action: "release.read", label: "ai release read" },
  { key: "ai.developer.read", resource: "ai", action: "developer.read", label: "ai developer read" },
  { key: "ai.forecast.read", resource: "ai", action: "forecast.read", label: "ai forecast read" },
  { key: "ai.governance.manage", resource: "ai", action: "governance.manage", label: "ai governance manage" },
];

const permissions = [...RESOURCE_PERMISSIONS, ...CUSTOM_PERMISSIONS];

function allKeys() {
  return permissions.map((permission) => permission.key);
}

function has(permission) {
  return allKeys().includes(permission);
}

function expand(keys = []) {
  const all = allKeys();
  const output = new Set();
  keys.forEach((key) => {
    if (key === "*") all.forEach((item) => output.add(item));
    else if (key.endsWith(".*")) {
      const prefix = key.slice(0, -1);
      all.filter((item) => item.startsWith(prefix)).forEach((item) => output.add(item));
    } else if (has(key)) output.add(key);
  });
  return [...output];
}

module.exports = { RESOURCES, ACTIONS, permissions, allKeys, has, expand };
