const { constructWebhookEvent } = require("../services/stripeService");
const { confirmOrderPaid } = require("../services/paymentService");
const {
  beginWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
} = require("../utils/webhookGuard");
const Order = require("../models/Order");

async function handleStripeWebhook(req, res) {
  let event;

  try {
    const signature = req.headers["stripe-signature"];
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ success: false, message: "Webhook signature verification failed." });
  }

  console.log("[Stripe Webhook]", {
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
    console.log("[Stripe Webhook]", {
      eventId: event.id,
      eventType: event.type,
      status: "duplicate",
      existingStatus: status,
    });
    return res.json({ received: true, duplicate: true, status });
  }

  try {
    console.log("[Stripe Webhook]", {
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
    console.log("[Stripe Webhook]", {
      eventId: event.id,
      eventType: event.type,
      status: "processing_completed",
    });
    res.json({ received: true });
  } catch (err) {
    console.error("[Stripe Webhook]", {
      eventId: event.id,
      eventType: event.type,
      status: "processing_failed",
      error: err.message,
    });
    await markWebhookFailed("stripe", event.id, err.message);
    res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
}

module.exports = { handleStripeWebhook };
