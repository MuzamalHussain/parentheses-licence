const cache = new Map();
let hits = 0;
let misses = 0;

async function getCached(key, ttlMs, factory) {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    hits += 1;
    return existing.value;
  }

  misses += 1;
  const value = await factory();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

function clearCache(prefix = "") {
  for (const key of cache.keys()) {
    if (!prefix || key.startsWith(prefix)) cache.delete(key);
  }
}

function getCacheStats() {
  return {
    size: cache.size,
    hits,
    misses,
  };
}

module.exports = { getCached, clearCache, getCacheStats };
