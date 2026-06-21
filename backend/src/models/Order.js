const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },

    // Snapshot pricing at time of order — plan prices can change later,
    // but this order must always reflect what the customer actually agreed to pay.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      required: true,
    },

    // Which gateway this order is being processed through.
    gateway: {
      type: String,
      enum: ["stripe", "local"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "expired", "refunded"],
      default: "pending",
      index: true,
    },

    couponCode: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Gateway-specific checkout session/reference, used to reconcile webhooks.
    gatewayCheckoutId: {
      type: String,
      default: "",
      index: true,
    },

    // The license created once this order is confirmed paid (set by confirmOrderPaid).
    licenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "License",
      default: null,
    },

    paidAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },

    // Audit: did a customer abandon checkout? Set by the expiry cron (Phase 6).
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h to complete payment
    },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ gateway: 1, gatewayCheckoutId: 1 });
orderSchema.index({ status: 1, expiresAt: 1 }); // for the future auto-expire cron

module.exports = mongoose.model("Order", orderSchema);
