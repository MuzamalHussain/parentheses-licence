const Redis = require("ioredis");
const { getConfig } = require("./env");

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
    console.log("[Redis] REDIS_ENABLED=false — skipping Redis, rate limiter will use in-memory store.");
    return null;
  }

  client = new Redis(config.security.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  });

  client.on("connect",  () => { isConnected = true;  console.log("[Redis] Connected."); });
  client.on("error",    (e) => { isConnected = false; console.error("[Redis] Error:", e.message); });
  client.on("close",    () => { isConnected = false; });

  client.connect().catch((e) => {
    console.error("[Redis] Initial connect failed:", e.message);
    client = null;
  });

  return client;
}

function isRedisConnected() { return isConnected; }

module.exports = { getRedisClient, isRedisConnected };
