const { constructWebhookEvent } = require("../services/stripeService");
const { confirmOrderPaid } = require("../services/paymentService");
const { recordWebhookEvent, markWebhookProcessed } = require("../utils/webhookGuard");
const Order = require("../models/Order");

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/webhooks/stripe
// IMPORTANT: this route must receive the RAW request body (not JSON-parsed)
// for signature verification to work — see app.js, this route is mounted
// before express.json() with express.raw().
// ─────────────────────────────────────────────────────────────────────────────
async function handleStripeWebhook(req, res) {
  let event;

  try {
    const signature = req.headers["stripe-signature"];
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ success: false, message: `Webhook signature verification failed.` });
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────────
  const { isNew } = await recordWebhookEvent({
    gateway: "stripe",
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });

  if (!isNew) {
    // Already seen this event (Stripe retried delivery) — ack without reprocessing.
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (!orderId) {
        throw new Error("Stripe session missing metadata.orderId");
      }

      await confirmOrderPaid(orderId, {
        gateway: "stripe",
        gatewayTransactionId: session.payment_intent || session.id,
        amount: (session.amount_total || 0) / 100, // cents -> major units
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
      // Stripe Checkout failures also surface here in some flows — best effort match.
      await Order.updateOne(
        { gatewayCheckoutId: intent.id, status: "pending" },
        { status: "failed", failureReason: intent.last_payment_error?.message || "Payment failed." }
      );
    }

    await markWebhookProcessed("stripe", event.id);
    res.json({ received: true });
  } catch (err) {
    console.error("[Stripe Webhook] Processing error:", err.message);
    await markWebhookProcessed("stripe", event.id, err.message);
    // Return 500 so Stripe retries — but the idempotency guard means a
    // successful retry won't double-process anything we already finished.
    res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
}

module.exports = { handleStripeWebhook };
