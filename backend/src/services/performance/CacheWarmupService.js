const Cache = require("./CacheManager");

const warmers = [
  { id: "dashboard", policy: "dashboard", tags: ["dashboard"], build: async () => ({ warmed: true, source: "dashboard", at: new Date().toISOString() }) },
  { id: "organizations", policy: "organizations", tags: ["organizations"], build: async () => ({ warmed: true, source: "organizations", at: new Date().toISOString() }) },
  { id: "licenses", policy: "licenses", tags: ["licenses"], build: async () => ({ warmed: true, source: "licenses", at: new Date().toISOString() }) },
  { id: "products", policy: "products", tags: ["products"], build: async () => ({ warmed: true, source: "products", at: new Date().toISOString() }) },
  { id: "analytics", policy: "analytics", tags: ["analytics"], build: async () => ({ warmed: true, source: "analytics", at: new Date().toISOString() }) },
  { id: "settings", policy: "settings", tags: ["settings"], build: async () => ({ warmed: true, source: "settings", at: new Date().toISOString() }) },
];

async function warm(targets = []) {
  const selected = targets.length ? warmers.filter((warmer) => targets.includes(warmer.id)) : warmers;
  const results = [];
  for (const warmer of selected) {
    const key = Cache.scopedKey({ scope: "warmup", id: warmer.id });
    const value = await warmer.build();
    await Cache.set(key, value, { policy: warmer.policy, tags: warmer.tags });
    results.push({ id: warmer.id, key, status: "warmed" });
  }
  return { warmedAt: new Date().toISOString(), results };
}

function plan() {
  return warmers.map(({ id, policy, tags }) => ({ id, policy, tags }));
}

module.exports = { plan, warm };
