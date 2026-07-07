const PaymentProviderInterface = require("./PaymentProviderInterface");
const { createLocalCheckout, verifyWebhookSignature } = require("../localPspService");
const apiSecurityConfig = require("../../config/apiSecurity");

function validateWebhookTimestamp(rawTimestamp) {
  if (!rawTimestamp) return false;
  const timestampMs = Number(rawTimestamp) * (String(rawTimestamp).length === 10 ? 1000 : 1);
  if (!Number.isFinite(timestampMs)) return false;
  const ageSeconds = Math.abs(Date.now() - timestampMs) / 1000;
  return ageSeconds <= apiSecurityConfig.webhooks.timestampToleranceSeconds;
}

class LocalPspPaymentProvider extends PaymentProviderInterface {
  constructor() {
    super("local");
  }

  async createCheckoutSession({ order, productName, planName, successUrl, cancelUrl, customerEmail, customerName }) {
    const session = await createLocalCheckout({ order, productName, planName, successUrl, cancelUrl, customerEmail, customerName });
    return {
      provider: this.id,
      checkoutUrl: session.checkoutUrl,
      sessionId: session.checkoutId,
      expiresAt: order.expiresAt || null,
      raw: session,
    };
  }

  parseWebhookEvent({ rawBody, headers }) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
    const signature = headers["x-signature"] || headers["x-psp-signature"];
    const timestamp = headers["x-webhook-timestamp"] || headers["x-psp-timestamp"];

    if (!validateWebhookTimestamp(timestamp)) {
      const err = new Error("Invalid webhook timestamp.");
      err.code = "INVALID_TIMESTAMP";
      throw err;
    }
    if (!verifyWebhookSignature(body, signature)) {
      const err = new Error("Invalid signature.");
      err.code = "INVALID_SIGNATURE";
      throw err;
    }

    const payload = JSON.parse(body);
    const eventId = payload.event_id || `${payload.transaction_id}-${payload.status}`;
    const eventType = payload.event_type || payload.status || "";
    let action = "ignored";
    if (payload.status === "succeeded" || payload.event_type === "payment.succeeded") action = "payment.succeeded";
    if (payload.status === "failed" || payload.event_type === "payment.failed") action = "payment.failed";
    if (payload.status === "cancelled" || payload.event_type === "payment.cancelled") action = "payment.cancelled";
    if (payload.status === "refunded" || payload.event_type === "payment.refunded") action = "payment.refunded";

    return {
      provider: this.id,
      eventId,
      eventType,
      action,
      orderId: payload.order_id,
      transactionId: payload.transaction_id,
      sessionId: payload.checkout_id || payload.transaction_id,
      amount: Number(payload.amount || 0),
      currency: payload.currency || "PKR",
      failureReason: payload.failure_reason || "Payment failed.",
      raw: payload,
    };
  }
}

module.exports = { LocalPspPaymentProvider, validateWebhookTimestamp };
