const policies = new Map();

const defaultPolicy = {
  id: "enterprise-default",
  name: "Enterprise Default",
  enabled: true,
  schedules: ["daily", "weekly", "monthly"],
  retentionDays: 30,
  encryption: "metadata",
  backupTypes: ["full", "incremental", "differential", "manual"],
  targets: ["mongodb", "uploaded_files", "plugin_packages", "configuration", "organizations", "licenses", "orders", "audit_logs", "ai_configuration"],
  rtoMinutes: 60,
  rpoMinutes: 15,
};

function getPolicy(id = "enterprise-default") {
  return policies.get(id) || { ...defaultPolicy, id };
}

function updatePolicy(id, patch = {}) {
  const policy = { ...getPolicy(id), ...patch, id };
  policies.set(id, policy);
  return policy;
}

function listPolicies() {
  const values = Array.from(policies.values());
  return values.length ? values : [getPolicy()];
}

function resetForTests() {
  policies.clear();
}

module.exports = { getPolicy, listPolicies, resetForTests, updatePolicy };
