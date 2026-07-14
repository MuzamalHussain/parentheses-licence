const PaymentProviderInterface = require("./PaymentProviderInterface");
const { createCheckoutSession, constructWebhookEvent } = require("../stripeService");

class StripePaymentProvider extends PaymentProviderInterface {
  constructor() {
    super("stripe");
  }

  async createCheckoutSession({ order, productName, planName, successUrl, cancelUrl, customerEmail }) {
    const session = await createCheckoutSession({ order, productName, planName, successUrl, cancelUrl, customerEmail });
    return {
      provider: this.id,
      checkoutUrl: session.url,
      sessionId: session.id,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : order.expiresAt || null,
      raw: session,
    };
  }

  async parseWebhookEvent({ rawBody, headers }) {
    const event = await constructWebhookEvent(rawBody, headers["stripe-signature"]);
    const base = {
      provider: this.id,
      eventId: event.id,
      eventType: event.type,
      raw: event,
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      return {
        ...base,
        action: "payment.succeeded",
        orderId: session.metadata?.orderId,
        transactionId: session.payment_intent || session.id,
        sessionId: session.id,
        amount: (session.amount_total || 0) / 100,
        currency: (session.currency || "usd").toUpperCase(),
      };
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      return { ...base, action: "payment.cancelled", orderId: session.metadata?.orderId, sessionId: session.id };
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      return {
        ...base,
        action: "payment.failed",
        transactionId: intent.id,
        sessionId: intent.id,
        failureReason: intent.last_payment_error?.message || "Payment failed.",
      };
    }

    if (event.type === "charge.refunded" || event.type === "refund.created") {
      const refund = event.data.object;
      return {
        ...base,
        action: "payment.refunded",
        transactionId: refund.payment_intent || refund.charge || refund.id,
        amount: refund.amount ? refund.amount / 100 : 0,
        currency: (refund.currency || "usd").toUpperCase(),
      };
    }

    return { ...base, action: "ignored" };
  }
}

module.exports = StripePaymentProvider;
