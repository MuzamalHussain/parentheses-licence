const mongoose = require("mongoose");

const outgoingWebhookSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    endpointId: { type: mongoose.Schema.Types.ObjectId, ref: "WebhookEndpoint", default: null, index: true },
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "Integration", default: null, index: true },
    providerId: { type: String, default: "webhook", index: true },
    eventName: { type: String, required: true, index: true },
    endpointUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "queued", "delivering", "sent", "failed", "retrying", "dead_letter", "disabled", "skipped"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    envelope: { type: mongoose.Schema.Types.Mixed, default: {} },
    responseStatus: { type: Number, default: 0 },
    responseBody: { type: String, default: "" },
    signature: { type: String, default: "" },
    timestampHeader: { type: String, default: "" },
    lastError: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null },
    deadLetterAt: { type: Date, default: null },
  },
  { timestamps: true }
);

outgoingWebhookSchema.index({ eventId: 1, endpointId: 1 }, { unique: true, partialFilterExpression: { endpointId: { $exists: true, $ne: null } } });
outgoingWebhookSchema.index({ eventName: 1, status: 1, createdAt: -1 });
outgoingWebhookSchema.index({ providerId: 1, createdAt: -1 });
outgoingWebhookSchema.index({ endpointUrl: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("OutgoingWebhook", outgoingWebhookSchema);
