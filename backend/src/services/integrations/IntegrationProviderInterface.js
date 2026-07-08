class IntegrationProviderInterface {
  constructor({ id, name, version = "0.1.0", capabilities = [], configurable = true }) {
    if (!id || !name) throw new Error("Integration provider requires id and name.");
    this.id = id;
    this.name = name;
    this.version = version;
    this.capabilities = capabilities;
    this.configurable = configurable;
  }

  validateConfig() {
    return { valid: true, errors: [] };
  }

  async testConnection() {
    return { success: false, status: "pending", message: `${this.name} integration is not configured yet.` };
  }

  async health() {
    return { status: "unknown", message: "Health check not implemented.", version: this.version };
  }
}

module.exports = IntegrationProviderInterface;
