const mongoose = require("mongoose");

const WEBHOOK_EVENTS = [
  "UserRegistered",
  "UserUpdated",
  "UserDeleted",
  "OrderCreated",
  "OrderCompleted",
  "PaymentSucceeded",
  "PaymentFailed",
  "PaymentRefunded",
  "LicenseCreated",
  "LicenseActivated",
  "LicenseDeactivated",
  "LicenseRenewed",
  "LicenseExpired",
  "VersionReleased",
  "DownloadCompleted",
  "SupportTicketCreated",
  "SupportTicketUpdated",
];

const webhookEndpointSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    targetUrl: { type: String, required: true, trim: true, maxlength: 2000 },
    secretHash: { type: String, required: true, select: false },
    secretLast4: { type: String, required: true },
    enabled: { type: Boolean, default: true, index: true },
    subscribedEvents: { type: [String], enum: WEBHOOK_EVENTS, default: [] },
    apiVersion: { type: String, default: "2026-07-08" },
    maxRetries: { type: Number, default: 4, min: 0, max: 10 },
    lastDeliveryAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

webhookEndpointSchema.index({ enabled: 1, updatedAt: -1 });
webhookEndpointSchema.index({ subscribedEvents: 1, enabled: 1 });

module.exports = mongoose.model("WebhookEndpoint", webhookEndpointSchema);
module.exports.WEBHOOK_EVENTS = WEBHOOK_EVENTS;
