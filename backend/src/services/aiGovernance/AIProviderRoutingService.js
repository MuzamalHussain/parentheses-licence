const AIProviderConfig = require("../../models/AIProviderConfig");

function providerScore(provider, strategy = "priority") {
  const health = provider.health?.status || "unknown";
  const healthScore = health === "healthy" ? 100 : health === "degraded" ? 60 : health === "unknown" ? 40 : 0;
  if (strategy === "health") return healthScore;
  if (strategy === "latency") return Math.max(0, 100 - Number(provider.health?.latencyMs || provider.timeoutMs || 30000) / 1000);
  if (strategy === "cost") return Math.max(0, 100 - Number(provider.fallbackOrder || 100));
  return Math.max(0, 100 - Number(provider.fallbackOrder || 100)) + healthScore / 10;
}

async function route({ organizationId, capability = "chat", strategy = "priority" } = {}) {
  const providers = await AIProviderConfig.find({ organizationId, status: "configured" }).sort({ fallbackOrder: 1, providerId: 1 }).lean();
  const eligible = providers.filter((provider) => !capability || (provider.capabilities || []).includes(capability));
  const ranked = eligible
    .map((provider) => {
      const safe = { ...provider, score: providerScore(provider, strategy) };
      delete safe.encryptedApiKey;
      return safe;
    })
    .sort((a, b) => b.score - a.score || Number(a.fallbackOrder || 100) - Number(b.fallbackOrder || 100));
  return {
    selected: ranked[0] || null,
    fallbackChain: ranked.slice(1).map((provider) => ({ providerId: provider.providerId, name: provider.name, health: provider.health, fallbackOrder: provider.fallbackOrder, score: provider.score })),
    strategy,
    capability,
  };
}

module.exports = { providerScore, route };
