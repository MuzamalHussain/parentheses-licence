const Redis = require("ioredis");
const { getConfig } = require("./env");
const { logInfo, logWarn, logError } = require("../utils/logger");

let client = null;
let isConnected = false;

/**
 * Returns a connected Redis client, or null if Redis is disabled / unavailable.
 * Callers must check for null — the rate limiter falls back to in-memory when null.
 */
function getRedisClient() {
  const config = getConfig();
  if (client) return client;

  if (!config.security.redisEnabled) {
    logInfo("redis.disabled", { reason: "REDIS_ENABLED=false" });
    return null;
  }

  client = new Redis(config.security.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  });

  client.on("connect",  () => { isConnected = true;  logInfo("redis.connected"); });
  client.on("error",    (e) => { isConnected = false; logError("redis.error", { error: e }); });
  client.on("close",    () => { isConnected = false; });

  client.connect().catch((e) => {
    logWarn("redis.initial_connect_failed", { error: e });
    client = null;
  });

  return client;
}

function isRedisConnected() { return isConnected; }

module.exports = { getRedisClient, isRedisConnected };
