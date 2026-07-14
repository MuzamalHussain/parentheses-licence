const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: ["stripe", "wise_business", "hblpay_checkout", "local", "paypal", "lemon_squeezy", "paddle", "manual"],
      required: true,
    },
    gatewayTransactionId: {
      type: String,
      default: "",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "authorized", "succeeded", "failed", "cancelled", "refunded", "partially_refunded"],
      required: true,
    },
    providerSessionId: { type: String, default: "", index: true },
    providerEventId: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    isTestPayment: { type: Boolean, default: false, index: true },
    // Full raw webhook payload — kept for dispute resolution / debugging.
    // Never displayed to the customer; admin-only via the Orders module.
    rawWebhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index(
  { gateway: 1, gatewayTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { gatewayTransactionId: { $type: "string", $gt: "" } },
  }
);
paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
