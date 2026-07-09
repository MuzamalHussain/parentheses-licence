const policyCache = new Map();

const defaultPolicies = {
  global: {
    id: "global",
    status: "enabled",
    leastPrivilege: true,
    requireAuthenticatedAdmin: true,
    requireRequestId: true,
    maxRiskScore: 70,
    replayProtection: "foundation",
  },
  api: {
    id: "api",
    status: "enabled",
    requestValidation: true,
    rateLimiting: true,
    requestSignature: "foundation",
    protectedSurfaces: ["rest", "admin", "developer", "ai", "webhooks", "downloads"],
  },
  ai: {
    id: "ai",
    status: "enabled",
    providerKeyRedaction: true,
    promptAudit: true,
    organizationIsolation: true,
  },
  deployment: {
    id: "deployment",
    status: "enabled",
    productionApprovalRequired: true,
    secretExposureBlocked: true,
    rollbackValidationRequired: true,
  },
};

function policyKey(scope = "global", organizationId = "global", role = "any") {
  return `${organizationId}:${role}:${scope}`;
}

function resolve({ scope = "global", organizationId = "global", role = "any" } = {}) {
  const key = policyKey(scope, organizationId, role);
  if (policyCache.has(key)) return policyCache.get(key);
  const base = defaultPolicies[scope] || defaultPolicies.global;
  const resolved = {
    ...base,
    scope,
    organizationId,
    role,
    source: organizationId === "global" ? "global_policy" : "organization_policy",
    cached: true,
  };
  policyCache.set(key, resolved);
  return resolved;
}

function listPolicies() {
  return Object.values(defaultPolicies).map((policy) => ({ ...policy }));
}

function updatePolicy(scope, patch = {}) {
  const existing = defaultPolicies[scope] || { id: scope, status: "enabled" };
  defaultPolicies[scope] = { ...existing, ...patch, id: scope };
  policyCache.clear();
  return defaultPolicies[scope];
}

function resetForTests() {
  policyCache.clear();
}

module.exports = { listPolicies, resetForTests, resolve, updatePolicy };
