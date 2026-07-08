const cache = new Map();
const TTL_MS = 60 * 1000;

function keyFor(userId, organizationId) {
  return `${organizationId}:${userId}`;
}

function get(userId, organizationId) {
  const item = cache.get(keyFor(userId, organizationId));
  if (!item || item.expiresAt < Date.now()) return null;
  return item.value;
}

function set(userId, organizationId, value) {
  cache.set(keyFor(userId, organizationId), { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

function invalidate(userId, organizationId) {
  if (userId && organizationId) cache.delete(keyFor(userId, organizationId));
  else cache.clear();
}

module.exports = { get, set, invalidate };
