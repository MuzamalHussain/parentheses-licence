const paymentManager = require("../services/paymentManager");
const { logError } = require("../utils/logger");

async function handleStripeWebhook(req, res) {
  let event;
  try {
    event = paymentManager.parseWebhookEvent("stripe", {
      rawBody: req.body,
      headers: req.headers,
    });
  } catch (err) {
    logError("stripe_webhook.signature_verification_failed", { error: err.message });
    return res.status(400).json({ success: false, message: "Webhook signature verification failed.", requestId: req.id });
  }

  try {
    const result = await paymentManager.processWebhookEvent(event, req);
    if (result.duplicate) return res.json({ received: true, duplicate: true, status: result.status });
    return res.json({ received: true, ignored: result.ignored });
  } catch (err) {
    logError("stripe_webhook.processing_failed", {
      eventId: event.eventId,
      eventType: event.eventType,
      status: "processing_failed",
      error: err.message,
    });
    return res.status(500).json({ success: false, message: "Webhook processing failed.", requestId: req.id });
  }
}

module.exports = { handleStripeWebhook };
