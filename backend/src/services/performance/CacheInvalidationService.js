const Cache = require("./CacheManager");
const { writeAuditLog } = require("../../utils/auditLog");

const groups = {
  dashboard: ["dashboard", "analytics"],
  organizations: ["organizations", "dashboard"],
  licenses: ["licenses", "downloads", "analytics", "dashboard"],
  products: ["products", "versions", "downloads", "analytics", "dashboard"],
  analytics: ["analytics", "dashboard"],
  settings: ["settings", "configuration"],
  sessions: ["sessions"],
};

async function invalidate({ tags = [], group = "", actor = null, ip = "", requestId = "" } = {}) {
  const resolvedTags = Array.from(new Set([...(groups[group] || []), ...tags]));
  const result = resolvedTags.length ? await Cache.purgeByTags(resolvedTags) : await Cache.clear();
  await writeAuditLog({
    actor,
    action: "performance.cache_invalidated",
    targetType: "Performance",
    metadata: { group, tags: resolvedTags, result },
    ip,
    requestId,
  });
  return { ...result, group, tags: resolvedTags };
}

function invalidationGroups() {
  return Object.entries(groups).map(([group, tags]) => ({ group, tags }));
}

module.exports = { invalidate, invalidationGroups };
