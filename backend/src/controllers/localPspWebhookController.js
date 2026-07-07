const paymentManager = require("../services/paymentManager");
const { validateWebhookTimestamp } = require("../services/paymentProviders/LocalPspPaymentProvider");
const { logError } = require("../utils/logger");

async function handleLocalPspWebhook(req, res) {
  let event;
  try {
    event = paymentManager.parseWebhookEvent("local", {
      rawBody: req.body,
      headers: req.headers,
    });
  } catch (err) {
    const isTimestamp = err.code === "INVALID_TIMESTAMP";
    logError(isTimestamp ? "local_psp_webhook.timestamp_verification_failed" : "local_psp_webhook.signature_verification_failed");
    return res.status(400).json({
      success: false,
      message: isTimestamp ? "Invalid webhook timestamp." : "Invalid signature.",
      requestId: req.id,
    });
  }

  try {
    const result = await paymentManager.processWebhookEvent(event, req);
    if (result.duplicate) return res.json({ received: true, duplicate: true, status: result.status });
    return res.json({ received: true, ignored: result.ignored });
  } catch (err) {
    logError("local_psp_webhook.processing_failed", { error: err.message });
    return res.status(500).json({ success: false, message: "Webhook processing failed.", requestId: req.id });
  }
}

module.exports = { handleLocalPspWebhook, _private: { validateWebhookTimestamp } };
