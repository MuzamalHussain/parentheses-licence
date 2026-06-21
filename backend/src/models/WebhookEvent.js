const mongoose = require("mongoose");

// Every inbound webhook event is recorded here BEFORE processing.
// Gateways retry webhooks on timeout/non-200 — this table is what makes
// confirmOrderPaid() safe to receive the same event twice without
// double-issuing a license.
const webhookEventSchema = new mongoose.Schema(
  {
    gateway: {
      type: String,
      enum: ["stripe", "local"],
      required: true,
    },
    // The gateway's own unique event ID (Stripe: evt_xxx). For gateways
    // that don't provide one, derive a stable id (e.g. hash of payload).
    eventId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      default: "",
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processingError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// One record per (gateway, eventId) — the unique index IS the idempotency guarantee.
webhookEventSchema.index({ gateway: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
