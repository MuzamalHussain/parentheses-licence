const WebhookEvent = require("../models/WebhookEvent");

const PROCESSING_STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Claims a webhook event for business processing.
 *
 * A processed event is never processed again. A failed event can be claimed by
 * a later gateway retry. The unique (gateway, eventId) index on WebhookEvent is
 * the concurrency boundary, so simultaneous duplicates cannot both win.
 */
async function beginWebhookProcessing({ gateway, eventId, eventType, payload }) {
  try {
    await WebhookEvent.create({
      gateway,
      eventId,
      eventType,
      payload,
      status: "processing",
      processed: false,
      processingError: "",
      processedAt: null,
    });
    return { shouldProcess: true, status: "processing", attempt: "created" };
  } catch (err) {
    if (err.code !== 11000) {
      throw err;
    }

    const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS);
    const claimed = await WebhookEvent.findOneAndUpdate(
      {
        gateway,
        eventId,
        $or: [
          { status: "failed" },
          { status: "processing", updatedAt: { $lt: staleBefore } },
          { status: { $exists: false }, processed: false, processingError: { $ne: "" } },
          { status: { $exists: false }, processed: false, updatedAt: { $lt: staleBefore } },
        ],
      },
      {
        eventType,
        payload,
        status: "processing",
        processed: false,
        processingError: "",
        processedAt: null,
      },
      { new: true }
    );

    if (claimed) {
      return { shouldProcess: true, status: "processing", attempt: "retry" };
    }

    const existing = await WebhookEvent.findOne({ gateway, eventId }).lean();
    return {
      shouldProcess: false,
      status: existing?.status || (existing?.processed ? "processed" : "processing"),
      attempt: "duplicate",
    };
  }
}

async function markWebhookProcessed(gateway, eventId) {
  await WebhookEvent.updateOne(
    { gateway, eventId },
    {
      status: "processed",
      processed: true,
      processingError: "",
      processedAt: new Date(),
    }
  );
}

async function markWebhookFailed(gateway, eventId, error = "") {
  await WebhookEvent.updateOne(
    { gateway, eventId },
    {
      status: "failed",
      processed: false,
      processingError: error,
      processedAt: null,
    }
  );
}

module.exports = {
  beginWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
  recordWebhookEvent: beginWebhookProcessing,
};
