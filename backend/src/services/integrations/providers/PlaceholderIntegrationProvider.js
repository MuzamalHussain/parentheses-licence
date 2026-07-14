const IntegrationProviderInterface = require("../IntegrationProviderInterface");

class PlaceholderIntegrationProvider extends IntegrationProviderInterface {
  constructor({ id, name, category = "General", capabilities = [], fields = [] }) {
    super({ id, name, version: "0.1.0", capabilities });
    this.category = category;
    this.fields = fields;
  }

  validateConfig(config = {}) {
    const errors = [];
    if (config.webhookUrl && !/^https?:\/\//i.test(config.webhookUrl)) errors.push("webhookUrl must be an absolute http(s) URL.");
    if (config.signingSecret && String(config.signingSecret).length < 16) errors.push("signingSecret must be at least 16 characters.");
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config = {}) {
    const validation = this.validateConfig(config);
    if (!validation.valid) return { success: false, status: "error", message: validation.errors.join("; ") };
    return { success: true, status: "pending", message: `${this.name} provider scaffold is ready.` };
  }

  async health(config = {}, integration = null) {
    const validation = this.validateConfig(config);
    return {
      status: validation.valid ? (integration?.enabled ? "ok" : "unknown") : "error",
      message: validation.valid ? "Provider scaffold loaded." : validation.errors.join("; "),
      version: this.version,
      lastSuccessfulSyncAt: integration?.lastSuccessfulSyncAt || null,
      lastError: integration?.lastError || "",
    };
  }
}

module.exports = PlaceholderIntegrationProvider;
