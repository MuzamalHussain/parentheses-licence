const { getRedisClient, isRedisConnected } = require("../../config/redis");

const localCache = new Map();

function localGet(key) {
  const row = localCache.get(key);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < Date.now()) {
    localCache.delete(key);
    return null;
  }
  return row.value;
}

async function get(key) {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    const raw = await redis.get(key).catch(() => null);
    return raw ? JSON.parse(raw) : null;
  }
  return localGet(key);
}

async function set(key, value, ttlSeconds = 60) {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => null);
    return { backend: "redis", key };
  }
  localCache.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  return { backend: "memory", key };
}

async function del(key) {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) await redis.del(key).catch(() => null);
  localCache.delete(key);
  return { key };
}

function clearLocal() {
  localCache.clear();
}

function describe() {
  return {
    backend: isRedisConnected() ? "redis" : "memory",
    redisConnected: isRedisConnected(),
    capabilities: ["distributed_cache", "session_cache", "configuration_cache", "rate_limit_cache", "queue_cache"],
    localKeys: localCache.size,
  };
}

module.exports = { clearLocal, del, describe, get, set };
