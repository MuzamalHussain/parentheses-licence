class PaymentProviderInterface {
  constructor(id) {
    if (!id) throw new Error("Payment provider id is required.");
    this.id = id;
  }

  async createCheckoutSession() {
    throw new Error(`${this.id} does not implement createCheckoutSession.`);
  }

  parseWebhookEvent() {
    throw new Error(`${this.id} does not implement parseWebhookEvent.`);
  }

  async refundPayment() {
    throw new Error(`${this.id} does not implement refundPayment.`);
  }
}

module.exports = PaymentProviderInterface;
