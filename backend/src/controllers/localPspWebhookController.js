const { verifyWebhookSignature } = require("../services/localPspService");
const { confirmOrderPaid } = require("../services/paymentService");
const {
  beginWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
} = require("../utils/webhookGuard");
const Order = require("../models/Order");

/**
 * GENERIC webhook handler for the local PK PSP aggregator.
 *
 * Expected payload shape (placeholder — adjust field names once a specific
 * aggregator is chosen, per execution plan Week 5 Day 4):
 *   {
 *     event_id: "evt_xxx",
 *     event_type: "payment.succeeded" | "payment.failed",
 *     transaction_id: "txn_xxx",
 *     order_id: "<our Order._id>",
 *     amount: 13500.00,
 *     currency: "PKR",
 *     status: "succeeded" | "failed"
 *   }
 *
 * IMPORTANT: like the Stripe route, this must receive the RAW body for
 * HMAC verification — mounted with express.raw() before express.json().
 */
async function handleLocalPspWebhook(req, res) {
  const rawBody = req.body.toString("utf8");
  const signature = req.headers["x-signature"] || req.headers["x-psp-signature"];

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[Local PSP Webhook] Signature verification failed.");
    return res.status(400).json({ success: false, message: "Invalid signature." });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, message: "Invalid JSON payload." });
  }

  const eventId = payload.event_id || `${payload.transaction_id}-${payload.status}`;

  // ── Idempotency guard ─────────────────────────────────────────────────────────
  const { shouldProcess } = await beginWebhookProcessing({
    gateway: "local",
    eventId,
    eventType: payload.event_type || "",
    payload,
  });

  if (!shouldProcess) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (payload.status === "succeeded" || payload.event_type === "payment.succeeded") {
      if (!payload.order_id) throw new Error("Local PSP webhook missing order_id");

      await confirmOrderPaid(payload.order_id, {
        gateway: "local",
        gatewayTransactionId: payload.transaction_id,
        amount: Number(payload.amount),
        currency: payload.currency || "PKR",
        rawWebhookPayload: payload,
      });
    }

    if (payload.status === "failed" || payload.event_type === "payment.failed") {
      await Order.updateOne(
        { _id: payload.order_id, status: "pending" },
        { status: "failed", failureReason: payload.failure_reason || "Payment failed." }
      );
    }

    await markWebhookProcessed("local", eventId);
    res.json({ received: true });
  } catch (err) {
    console.error("[Local PSP Webhook] Processing error:", err.message);
    await markWebhookFailed("local", eventId, err.message);
    res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
}

module.exports = { handleLocalPspWebhook };
