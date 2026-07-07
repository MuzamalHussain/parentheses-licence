const PaymentProviderInterface = require("./PaymentProviderInterface");

class PlaceholderPaymentProvider extends PaymentProviderInterface {
  constructor(id) {
    super(id);
  }

  async createCheckoutSession() {
    throw new Error(`${this.id} provider is registered as a future integration but is not enabled yet.`);
  }

  parseWebhookEvent() {
    throw new Error(`${this.id} webhooks are not implemented yet.`);
  }
}

module.exports = PlaceholderPaymentProvider;
