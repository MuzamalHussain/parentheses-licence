const PlaceholderIntegrationProvider = require("./providers/PlaceholderIntegrationProvider");

class IntegrationRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    if (!provider?.id) throw new Error("Integration provider must expose an id.");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Integration provider '${providerId}' is not registered.`);
    return provider;
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      version: provider.version,
      capabilities: provider.capabilities,
      configurable: provider.configurable,
    }));
  }

  resetForTests() {
    this.providers.clear();
    registerDefaultProviders(this);
    return this;
  }
}

function registerDefaultProviders(registry) {
  [
    { id: "github", name: "GitHub", capabilities: ["webhooks", "release_sync"] },
    { id: "wordpress_org", name: "WordPress.org", capabilities: ["release_sync"] },
    { id: "slack", name: "Slack", capabilities: ["notifications", "webhooks"] },
    { id: "discord", name: "Discord", capabilities: ["notifications", "webhooks"] },
    { id: "zapier", name: "Zapier", capabilities: ["webhooks", "automation"] },
    { id: "make", name: "Make.com", capabilities: ["webhooks", "automation"] },
    { id: "future_ai", name: "Future AI Providers", capabilities: ["ai_hooks"] },
  ].forEach((definition) => registry.register(new PlaceholderIntegrationProvider(definition)));
}

const registry = new IntegrationRegistry();
registerDefaultProviders(registry);

module.exports = registry;
module.exports.IntegrationRegistry = IntegrationRegistry;
module.exports.registerDefaultProviders = registerDefaultProviders;
