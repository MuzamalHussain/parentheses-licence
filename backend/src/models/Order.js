const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    licenseId: { type: mongoose.Schema.Types.ObjectId, ref: "License", default: null },
    productName: { type: String, default: "" },
    planName: { type: String, default: "" },
    purchasedVersion: { type: String, default: "" },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
    subtotal: { type: Number, min: 0, required: true },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      uppercase: true,
    },
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
    items: {
      type: [orderItemSchema],
      default: [],
    },

    // Snapshot pricing at time of order — plan prices can change later,
    // but this order must always reflect what the customer actually agreed to pay.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    currency: {
      type: String,
      enum: ["USD", "PKR", "EUR", "GBP"],
      required: true,
    },

    // Which gateway this order is being processed through.
    gateway: {
      type: String,
      enum: ["stripe", "wise_business", "hblpay_checkout", "local", "paypal", "manual", "none"],
      default: "none",
    },
    checkoutSessionId: { type: String, default: "", index: true },
    billingDetails: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      company: { type: String, default: "" },
      country: { type: String, default: "" },
      state: { type: String, default: "" },
      city: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      addressLine1: { type: String, default: "" },
      addressLine2: { type: String, default: "" },
      taxId: { type: String, default: "" },
    },
    customerDetails: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      ipAddress: { type: String, default: "" },
      userAgent: { type: String, default: "" },
    },

    status: {
      type: String,
      enum: ["draft", "pending", "processing", "completed", "paid", "cancelled", "failed", "expired", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "authorized", "paid", "failed", "refunded", "partially_refunded", "cancelled"],
      default: "unpaid",
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
    taxRate: { type: Number, default: 0, min: 0 },
    taxProvider: { type: String, default: "manual" },
    couponProvider: { type: String, default: "internal" },
    paymentProvider: { type: String, default: "" },
    providerPayload: { type: Object, default: {} },

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
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },

    // Audit: did a customer abandon checkout? Set by the expiry cron (Phase 6).
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h to complete payment
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

orderSchema.pre("validate", function (next) {
  if (!this.orderNumber) {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.orderNumber = `ORD-${stamp}-${rand}`;
  }
  if (!this.items?.length && this.productId && this.planId) {
    this.items = [{
      productId: this.productId,
      planId: this.planId,
      licenseId: this.licenseId || null,
      quantity: 1,
      unitPrice: this.amount || 0,
      subtotal: this.amount || 0,
    }];
  }
  this.subtotal = this.subtotal || this.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  this.grandTotal = this.grandTotal || Math.max(0, this.subtotal + (this.taxAmount || 0) - (this.discountAmount || 0));
  this.amount = this.amount || this.grandTotal;
  next();
});

orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ gateway: 1, createdAt: -1 });
orderSchema.index({ status: 1, currency: 1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ gateway: 1, gatewayCheckoutId: 1 });
orderSchema.index({ status: 1, expiresAt: 1 }); // for the future auto-expire cron
orderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
orderSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
