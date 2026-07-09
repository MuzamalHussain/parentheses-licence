const deployments = new Map();

function record(deployment) {
  deployments.set(deployment.id, deployment);
  return deployment;
}

function update(id, patch = {}) {
  const existing = deployments.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  deployments.set(id, updated);
  return updated;
}

function get(id) {
  return deployments.get(id) || null;
}

function list(filters = {}) {
  return Array.from(deployments.values()).filter((deployment) => {
    if (filters.environment && deployment.environment !== filters.environment) return false;
    if (filters.status && deployment.status !== filters.status) return false;
    return true;
  }).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function resetForTests() {
  deployments.clear();
}

module.exports = { get, list, record, resetForTests, update };
