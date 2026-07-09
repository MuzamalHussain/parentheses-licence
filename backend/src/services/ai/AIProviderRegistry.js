const AIProviderInterface = require("./AIProviderInterface");

class AIProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    if (!provider?.id) throw new Error("AI provider must expose an id.");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`AI provider '${providerId}' is not registered.`);
    return provider;
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      capabilities: provider.capabilities,
      defaultBaseUrl: provider.defaultBaseUrl,
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
    { id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", capabilities: ["chat", "reasoning", "embeddings", "vision", "image_generation"] },
    { id: "anthropic", name: "Anthropic Claude", defaultBaseUrl: "https://api.anthropic.com", capabilities: ["chat", "reasoning", "vision"] },
    { id: "gemini", name: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com", capabilities: ["chat", "reasoning", "vision", "embeddings"] },
    { id: "groq", name: "Groq", defaultBaseUrl: "https://api.groq.com/openai/v1", capabilities: ["chat"] },
    { id: "ollama", name: "Ollama", defaultBaseUrl: "http://localhost:11434", capabilities: ["chat", "embeddings"] },
    { id: "openrouter", name: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", capabilities: ["chat", "reasoning", "vision"] },
    { id: "azure_openai", name: "Azure OpenAI", defaultBaseUrl: "", capabilities: ["chat", "reasoning", "embeddings", "vision"] },
    { id: "future", name: "Future Providers", defaultBaseUrl: "", capabilities: ["future"] },
  ].forEach((definition) => registry.register(new AIProviderInterface(definition)));
}

const registry = new AIProviderRegistry();
registerDefaultProviders(registry);

module.exports = registry;
module.exports.AIProviderRegistry = AIProviderRegistry;
module.exports.registerDefaultProviders = registerDefaultProviders;
