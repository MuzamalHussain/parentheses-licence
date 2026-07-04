const { constructWebhookEvent } = require("../services/stripeService");
const { confirmOrderPaid } = require("../services/paymentService");
const {
  beginWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
} = require("../utils/webhookGuard");
const Order = require("../models/Order");
const { logInfo, logError } = require("../utils/logger");

async function handleStripeWebhook(req, res) {
  let event;

  try {
    const signature = req.headers["stripe-signature"];
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    logError("stripe_webhook.signature_verification_failed", { error: err.message });
    return res.status(400).json({ success: false, message: "Webhook signature verification failed.", requestId: req.id });
  }

  logInfo("stripe_webhook.received", {
    eventId: event.id,
    eventType: event.type,
    status: "received",
  });

  const { shouldProcess, status, attempt } = await beginWebhookProcessing({
    gateway: "stripe",
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });

  if (!shouldProcess) {
    logInfo("stripe_webhook.duplicate", {
      eventId: event.id,
      eventType: event.type,
      status: "duplicate",
      existingStatus: status,
    });
    return res.json({ received: true, duplicate: true, status });
  }

  try {
    logInfo("stripe_webhook.processing_started", {
      eventId: event.id,
      eventType: event.type,
      status: "processing_started",
      attempt,
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (!orderId) {
        throw new Error("Stripe session missing metadata.orderId");
      }

      await confirmOrderPaid(orderId, {
        gateway: "stripe",
        gatewayTransactionId: session.payment_intent || session.id,
        amount: (session.amount_total || 0) / 100,
        currency: (session.currency || "usd").toUpperCase(),
        rawWebhookPayload: event,
      });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        await Order.updateOne(
          { _id: orderId, status: "pending" },
          { status: "expired" }
        );
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      await Order.updateOne(
        { gatewayCheckoutId: intent.id, status: "pending" },
        { status: "failed", failureReason: intent.last_payment_error?.message || "Payment failed." }
      );
    }

    await markWebhookProcessed("stripe", event.id);
    logInfo("stripe_webhook.processing_completed", {
      eventId: event.id,
      eventType: event.type,
      status: "processing_completed",
    });
    res.json({ received: true });
  } catch (err) {
    logError("stripe_webhook.processing_failed", {
      eventId: event.id,
      eventType: event.type,
      status: "processing_failed",
      error: err.message,
    });
    await markWebhookFailed("stripe", event.id, err.message);
    res.status(500).json({ success: false, message: "Webhook processing failed.", requestId: req.id });
  }
}

module.exports = { handleStripeWebhook };
