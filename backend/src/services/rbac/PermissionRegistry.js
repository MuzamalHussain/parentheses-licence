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

const permissions = RESOURCES.flatMap((resource) =>
  ACTIONS.map((action) => ({
    key: `${resource}.${action}`,
    resource,
    action,
    label: `${resource.replace(/_/g, " ")} ${action}`,
  }))
);

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
