const { getRedisClient } = require("../config/redis");

// In-memory store fallback (per-process, not distributed — dev only)
const memoryStore = new Map();

function cleanMemoryStore() {
  const now = Date.now();
  for (const [key, data] of memoryStore) {
    if (data.resetAt < now) memoryStore.delete(key);
  }
}
setInterval(cleanMemoryStore, 60_000);

/**
 * Redis sliding-window rate limiter.
 * Uses a sorted set per key: members = request timestamps, score = timestamp.
 *
 * @returns { allowed: boolean, remaining: number, resetAt: number (unix ms) }
 */
async function checkRateLimit(key, { maxRequests, windowMs }) {
  const redis = getRedisClient();
  const now   = Date.now();
  const windowStart = now - windowMs;
  const resetAt = now + windowMs;

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, "-inf", windowStart);   // remove old entries
      pipeline.zadd(key, now, `${now}-${Math.random()}`);    // add this request
      pipeline.zcard(key);                                    // count in window
      pipeline.pexpire(key, windowMs);                        // auto-expire key
      const results = await pipeline.exec();
      const count = results[2][1];                            // zcard result
      const allowed = count <= maxRequests;
      return { allowed, remaining: Math.max(0, maxRequests - count), resetAt };
    } catch (err) {
      console.error("[RateLimit] Redis error, falling through to allow:", err.message);
      return { allowed: true, remaining: maxRequests, resetAt };
    }
  }

  // ── In-memory fallback ────────────────────────────────────────────────────
  let data = memoryStore.get(key);
  if (!data || data.resetAt < now) {
    data = { count: 0, resetAt };
    memoryStore.set(key, data);
  }
  data.count += 1;
  const allowed   = data.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - data.count);
  return { allowed, remaining, resetAt: data.resetAt };
}

/**
 * Express middleware factory for the activation API endpoints.
 *
 * Key strategy:
 *  - Per-IP:         catches bots hammering random keys
 *  - Per-licenseKey: catches targeted key abuse (from request body)
 */
function activationRateLimiter({ maxPerIp = 30, maxPerKey = 10, windowMs = 60_000 } = {}) {
  return async (req, res, next) => {
    const ip         = req.ip || req.connection?.remoteAddress || "unknown";
    const licenseKey = (req.body?.licenseKey || "").toUpperCase().trim();

    const ipKey  = `rl:activation:ip:${ip}`;
    const keyKey = licenseKey ? `rl:activation:key:${licenseKey}` : null;

    const [ipResult, keyResult] = await Promise.all([
      checkRateLimit(ipKey,  { maxRequests: maxPerIp,  windowMs }),
      keyKey
        ? checkRateLimit(keyKey, { maxRequests: maxPerKey, windowMs })
        : Promise.resolve({ allowed: true, remaining: maxPerKey, resetAt: Date.now() + windowMs }),
    ]);

    const resetAt = Math.max(ipResult.resetAt, keyResult.resetAt);

    res.setHeader("X-RateLimit-Limit",     maxPerIp);
    res.setHeader("X-RateLimit-Remaining", Math.min(ipResult.remaining, keyResult.remaining));
    res.setHeader("X-RateLimit-Reset",     Math.ceil(resetAt / 1000));

    if (!ipResult.allowed) {
      return res.status(429).json({
        success: false,
        message: "Too many requests from this IP. Please slow down.",
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      });
    }

    if (!keyResult.allowed) {
      return res.status(429).json({
        success: false,
        message: "Too many requests for this license key. Please slow down.",
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      });
    }

    next();
  };
}

module.exports = { activationRateLimiter, checkRateLimit };
