const windows = new Map();
const nonces = new Map();

function bucketKey(parts) {
  return parts.filter(Boolean).join(":");
}

function checkWindow(key, limit, windowMs) {
  const now = Date.now();
  const item = windows.get(key) || { count: 0, resetAt: now + windowMs };
  if (item.resetAt <= now) {
    item.count = 0;
    item.resetAt = now + windowMs;
  }
  item.count += 1;
  windows.set(key, item);
  return { allowed: item.count <= limit, remaining: Math.max(limit - item.count, 0), resetAt: item.resetAt };
}

function reject(res, code, message, requestId) {
  return res.status(429).json({ success: false, error: { code, message }, requestId });
}

function preventReplay(req, res, next) {
  const nonce = req.get("x-api-nonce");
  if (!nonce || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const key = bucketKey([req.apiKey?._id, nonce]);
  const now = Date.now();
  const existing = nonces.get(key);
  if (existing && existing > now) return res.status(409).json({ success: false, error: { code: "REPLAY_DETECTED", message: "API nonce has already been used." }, requestId: req.id });
  nonces.set(key, now + 5 * 60 * 1000);
  next();
}

function publicApiRateLimit(req, res, next) {
  const id = req.apiKey?._id?.toString() || "anonymous";
  const limits = req.apiKey?.rateLimits || {};
  const endpoint = `${req.method}:${req.route?.path || req.path}`;

  const minute = checkWindow(bucketKey(["key", id, "minute"]), limits.perMinute || 120, 60_000);
  if (!minute.allowed) return reject(res, "RATE_LIMITED", "Per-key minute rate limit exceeded.", req.id);

  const burst = checkWindow(bucketKey(["key", id, endpoint, "burst"]), limits.burst || 30, 10_000);
  if (!burst.allowed) return reject(res, "BURST_LIMITED", "Endpoint burst limit exceeded.", req.id);

  const ip = checkWindow(bucketKey(["ip", req.ip, endpoint]), 300, 60_000);
  if (!ip.allowed) return reject(res, "IP_RATE_LIMITED", "Per-IP endpoint rate limit exceeded.", req.id);

  const daily = checkWindow(bucketKey(["key", id, "daily", new Date().toISOString().slice(0, 10)]), limits.daily || 10000, 24 * 60 * 60 * 1000);
  if (!daily.allowed) return reject(res, "DAILY_LIMITED", "Daily API key limit exceeded.", req.id);

  res.setHeader("X-RateLimit-Remaining", String(minute.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(minute.resetAt / 1000)));
  next();
}

function resetPublicApiRateLimitForTests() {
  windows.clear();
  nonces.clear();
}

module.exports = { publicApiRateLimit, preventReplay, resetPublicApiRateLimitForTests };
