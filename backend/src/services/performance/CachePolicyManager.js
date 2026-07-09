const performanceConfig = require("../../config/performance");

const policies = new Map();

const defaults = {
  dashboard: { ttlSeconds: 60, slidingExpiration: true, tags: ["dashboard"], level: "response" },
  organizations: { ttlSeconds: 120, slidingExpiration: true, tags: ["organizations"], level: "query" },
  licenses: { ttlSeconds: 60, slidingExpiration: true, tags: ["licenses"], level: "query" },
  products: { ttlSeconds: 300, slidingExpiration: false, tags: ["products"], level: "query" },
  analytics: { ttlSeconds: 180, slidingExpiration: false, tags: ["analytics"], level: "query" },
  settings: { ttlSeconds: 300, slidingExpiration: true, tags: ["settings"], level: "configuration" },
  sessions: { ttlSeconds: 900, slidingExpiration: true, tags: ["sessions"], level: "session" },
};

function policyFor(name = "default", overrides = {}) {
  const base = policies.get(name) || defaults[name] || {
    ttlSeconds: Math.max(1, Math.round((performanceConfig.cache?.statsTtlMs || 30_000) / 1000)),
    slidingExpiration: false,
    tags: [name],
    level: "memory",
  };
  return {
    name,
    ttlSeconds: Number(overrides.ttlSeconds || base.ttlSeconds || 60),
    slidingExpiration: Boolean(overrides.slidingExpiration ?? base.slidingExpiration),
    tags: Array.from(new Set([...(base.tags || []), ...(overrides.tags || [])])),
    level: overrides.level || base.level || "memory",
    scheduledRefresh: Boolean(overrides.scheduledRefresh ?? base.scheduledRefresh),
  };
}

function setPolicy(name, policy) {
  policies.set(name, policyFor(name, policy));
  return policies.get(name);
}

function listPolicies() {
  const names = new Set([...Object.keys(defaults), ...policies.keys()]);
  return Array.from(names).map((name) => policyFor(name));
}

module.exports = { listPolicies, policyFor, setPolicy };
