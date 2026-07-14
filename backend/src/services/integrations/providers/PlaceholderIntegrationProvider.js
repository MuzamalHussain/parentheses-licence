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
    const missing = this.fields.filter((field) => field.required && !config[field.key]).map((field) => field.label);
    if (missing.length) return { success: false, status: "configuration_error", message: `Missing required fields: ${missing.join(", ")}.` };
    if (this.id === "stripe") {
      const Stripe = require("stripe");
      const started = Date.now();
      const account = await new Stripe(config.secretKey, { timeout: 10000 }).accounts.retrieve();
      return { success: true, status: "healthy", message: `Stripe account ${account.id} authenticated.`, latencyMs: Date.now() - started, capabilities: { canCreateCustomerPayment: true, canReceivePaymentStatus: Boolean(config.webhookSecret), canUseWebhooks: Boolean(config.webhookSecret), canRefund: true, canUseRecurringPayments: true } };
    }
    if (this.id === "wise_business") {
      const axios = require("axios");
      const baseURL = config.environment === "sandbox" ? "https://api.sandbox.transferwise.tech" : "https://api.wise.com";
      const response = await axios.get(`${baseURL}/v1/profiles`, { headers: { Authorization: `Bearer ${config.apiToken}` }, timeout: 10000 });
      const profile = response.data?.find((item) => String(item.id) === String(config.profileId));
      if (!profile) return { success: false, status: "error", message: "Authentication succeeded, but the configured profile is not accessible." };
      return { success: false, status: "capability_unavailable", message: "Automatic customer payment confirmation is not available for this Wise configuration.", capabilities: { canCreateCustomerPayment: false, canReceivePaymentStatus: false, canUseWebhooks: Boolean(config.webhookSubscriptionId && config.webhookSecret), canRefund: false, canUseRecurringPayments: false } };
    }
    if (this.id === "hblpay_checkout") {
      return { success: false, status: "merchant_contract_required", message: "HBLPay merchant contract and callback verification profile must be supplied before connection testing or checkout can be enabled." };
    }
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
