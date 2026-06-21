const WebhookEvent = require("../models/WebhookEvent");

/**
 * Ensures a webhook event is processed at most once.
 *
 * Usage pattern in each gateway's webhook route:
 *   const { isNew } = await recordWebhookEvent({ gateway, eventId, eventType, payload });
 *   if (!isNew) return res.json({ received: true }); // ack the retry, do nothing else
 *   ... process the event, call confirmOrderPaid() ...
 *   await markWebhookProcessed(gateway, eventId);
 *
 * The uniqueness is enforced at the DB level (WebhookEvent has a unique
 * compound index on {gateway, eventId}), so this is safe even under
 * concurrent webhook deliveries — only one insert wins, the rest throw
 * E11000 and are treated as "already seen".
 */
async function recordWebhookEvent({ gateway, eventId, eventType, payload }) {
  try {
    await WebhookEvent.create({ gateway, eventId, eventType, payload, processed: false });
    return { isNew: true };
  } catch (err) {
    if (err.code === 11000) {
      return { isNew: false }; // duplicate — already recorded (and likely already processed)
    }
    throw err;
  }
}

async function markWebhookProcessed(gateway, eventId, error = "") {
  await WebhookEvent.updateOne(
    { gateway, eventId },
    { processed: !error, processingError: error }
  );
}

module.exports = { recordWebhookEvent, markWebhookProcessed };
