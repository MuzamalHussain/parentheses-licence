const DistributedCache = require("../infrastructure/DistributedCacheService");
const Policies = require("./CachePolicyManager");
const Tags = require("./CacheTagRegistry");

const memory = new Map();
const stats = { hits: 0, misses: 0, writes: 0, purges: 0 };

function now() {
  return Date.now();
}

function safeKey(parts = []) {
  return parts.map((part) => String(part ?? "none").replace(/[^a-zA-Z0-9:_-]/g, "_")).join(":");
}

function scopedKey({ organizationId = "global", scope = "general", id = "default" }) {
  return safeKey(["perf", organizationId, scope, id]);
}

function readMemory(key) {
  const row = memory.get(key);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < now()) {
    memory.delete(key);
    Tags.removeKey(key);
    return null;
  }
  if (row.policy?.slidingExpiration && row.policy.ttlSeconds) row.expiresAt = now() + row.policy.ttlSeconds * 1000;
  return row.value;
}

async function get(key, options = {}) {
  const policy = Policies.policyFor(options.policy || "default", options);
  if (policy.level !== "memory") {
    const distributed = await DistributedCache.get(key);
    if (distributed !== null && distributed !== undefined) {
      stats.hits += 1;
      if (policy.slidingExpiration) await DistributedCache.set(key, distributed, policy.ttlSeconds);
      return distributed;
    }
  }
  const local = readMemory(key);
  if (local !== null && local !== undefined) {
    stats.hits += 1;
    return local;
  }
  stats.misses += 1;
  return null;
}

async function set(key, value, options = {}) {
  const policy = Policies.policyFor(options.policy || "default", options);
  Tags.register(key, policy.tags);
  memory.set(key, { value, policy, expiresAt: policy.ttlSeconds ? now() + policy.ttlSeconds * 1000 : 0 });
  if (policy.level !== "memory") await DistributedCache.set(key, value, policy.ttlSeconds);
  stats.writes += 1;
  return { key, policy };
}

async function remember(key, options, factory) {
  const cached = await get(key, options);
  if (cached !== null && cached !== undefined) return cached;
  const value = await factory();
  await set(key, value, options);
  return value;
}

async function purge(keys = []) {
  for (const key of keys) {
    memory.delete(key);
    Tags.removeKey(key);
    if (DistributedCache.del) await DistributedCache.del(key);
  }
  stats.purges += keys.length;
  return { purged: keys.length };
}

async function purgeByTags(tags = []) {
  return purge(Tags.keysFor(tags));
}

async function clear() {
  const purged = memory.size;
  memory.clear();
  Tags.clear();
  stats.purges += purged;
  if (DistributedCache.clearLocal) DistributedCache.clearLocal();
  return { purged };
}

function snapshot() {
  const hitRatio = stats.hits + stats.misses ? Number((stats.hits / (stats.hits + stats.misses)).toFixed(4)) : 0;
  return {
    levels: ["memory", "redis", "response", "query", "configuration", "session"],
    backend: DistributedCache.describe(),
    memoryKeys: memory.size,
    tags: Tags.snapshot(),
    policies: Policies.listPolicies(),
    stats: { ...stats, hitRatio },
  };
}

module.exports = { clear, get, purge, purgeByTags, remember, safeKey, scopedKey, set, snapshot };
