const tagMap = new Map();

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function register(key, tags = []) {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  normalized.forEach((tag) => {
    const keys = tagMap.get(tag) || new Set();
    keys.add(key);
    tagMap.set(tag, keys);
  });
  return normalized;
}

function keysFor(tags = []) {
  const keys = new Set();
  tags.map(normalizeTag).filter(Boolean).forEach((tag) => {
    for (const key of tagMap.get(tag) || []) keys.add(key);
  });
  return Array.from(keys);
}

function removeKey(key) {
  for (const [tag, keys] of tagMap.entries()) {
    keys.delete(key);
    if (!keys.size) tagMap.delete(tag);
  }
}

function clear() {
  tagMap.clear();
}

function snapshot() {
  return Array.from(tagMap.entries()).map(([tag, keys]) => ({ tag, keys: keys.size }));
}

module.exports = { clear, keysFor, register, removeKey, snapshot };
