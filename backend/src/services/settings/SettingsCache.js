class SettingsCache {
  constructor({ ttlMs = 30_000, clock = () => Date.now() } = {}) { this.ttlMs = ttlMs; this.clock = clock; this.entries = new Map(); this.hits = 0; this.misses = 0; this.evictions = 0; }
  get(key) { const item = this.entries.get(key); if (!item) { this.misses += 1; return undefined; } if (item.expiresAt <= this.clock()) { this.entries.delete(key); this.evictions += 1; this.misses += 1; return undefined; } this.hits += 1; return item.value; }
  set(key, value, group, ttlMs = this.ttlMs) { this.entries.set(key, { value, group, expiresAt: this.clock() + ttlMs }); return value; }
  invalidate(key) { return this.entries.delete(key); }
  invalidateGroup(group) { let count = 0; for (const [key, item] of this.entries) if (item.group === group) { this.entries.delete(key); count += 1; } this.evictions += count; return count; }
  invalidateMany(keys = []) { return keys.reduce((count, key) => count + (this.invalidate(key) ? 1 : 0), 0); }
  clear() { const count = this.entries.size; this.entries.clear(); this.evictions += count; return count; }
  stats() { return { size: this.entries.size, hits: this.hits, misses: this.misses, evictions: this.evictions, ttlMs: this.ttlMs }; }
}
module.exports = SettingsCache;
