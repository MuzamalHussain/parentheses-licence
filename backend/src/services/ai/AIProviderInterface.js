class AIProviderInterface {
  constructor(definition = {}) {
    this.id = definition.id;
    this.name = definition.name;
    this.capabilities = definition.capabilities || [];
    this.defaultBaseUrl = definition.defaultBaseUrl || "";
  }

  validateConfig(config = {}) {
    if (!config.name) return { valid: false, errors: ["Provider name is required."] };
    if (config.baseUrl && !/^https?:\/\//i.test(config.baseUrl)) return { valid: false, errors: ["Provider base URL must be http or https."] };
    return { valid: true, errors: [] };
  }

  async health(config = {}) {
    const validation = this.validateConfig(config);
    return {
      status: validation.valid ? "healthy" : "degraded",
      errors: validation.errors,
      providerId: this.id,
    };
  }
}

module.exports = AIProviderInterface;
