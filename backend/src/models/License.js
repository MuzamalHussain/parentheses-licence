const mongoose = require("mongoose");

const activeDomainSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, lowercase: true, trim: true },
    activatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const licenseSchema = new mongoose.Schema(
  {
    licenseKey: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "pending", "active", "suspended", "expired", "revoked", "cancelled", "trial", "lifetime"],
      default: "active",
      index: true,
    },
    licenseType: {
      type: String,
      enum: ["single_site", "3_sites", "5_sites", "10_sites", "unlimited", "developer", "agency", "custom"],
      default: "single_site",
      index: true,
    },
    allowedSites: {
      type: Number,
      required: true,
      min: 0, // 0 = unlimited
    },
    // Current active domains (embedded — bounded by allowedSites)
    activeDomains: {
      type: [activeDomainSchema],
      default: [],
      validate: {
        validator(domains) {
          const normalized = domains.map((entry) => entry.domain);
          return normalized.length === new Set(normalized).size;
        },
        message: "Duplicate active domains are not allowed on a license.",
      },
    },
    expiresAt: {
      type: Date,
      default: null, // null = lifetime
    },
    allowedReleaseChannels: {
      type: [String],
      enum: ["stable", "release_candidate", "beta", "alpha", "internal"],
      default: [], // empty = stable only unless product flags allow a prerelease default
    },
    downloadLimits: {
      perLicense: { type: Number, default: 0, min: 0 },
      perVersion: { type: Number, default: 0, min: 0 },
      perDay: { type: Number, default: 0, min: 0 },
    },
    entitlements: {
      downloads: { type: Boolean, default: true },
      updates: { type: Boolean, default: true },
      activations: { type: Boolean, default: true },
      betaChannel: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      lifetimeUpdates: { type: Boolean, default: false },
      lifetimeSupport: { type: Boolean, default: false },
    },
    renewal: {
      eligible: { type: Boolean, default: true },
      autoRenew: { type: Boolean, default: false },
      gracePeriodDays: { type: Number, default: 0, min: 0 },
      renewalWindowDays: { type: Number, default: 30, min: 0 },
      lastRenewedAt: { type: Date, default: null },
      nextRenewalAt: { type: Date, default: null },
    },
    subscription: {
      status: {
        type: String,
        enum: ["none", "trialing", "active", "past_due", "paused", "cancelled", "expired", "manual"],
        default: "none",
        index: true,
      },
      startedAt: { type: Date, default: null },
      renewalDate: { type: Date, default: null },
      nextBillingAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
      pausedAt: { type: Date, default: null },
      resumedAt: { type: Date, default: null },
      expiredAt: { type: Date, default: null },
      manualRenewal: { type: Boolean, default: true },
      autoRenew: { type: Boolean, default: false },
      provider: { type: String, default: "manual" },
      externalSubscriptionId: { type: String, default: "" },
    },
    subscriptionHistory: {
      type: [{
        changedAt: { type: Date, default: Date.now },
        fromStatus: { type: String, default: "" },
        toStatus: { type: String, default: "" },
        action: { type: String, enum: ["pause", "resume", "cancel", "expire", "enable_auto_renew", "disable_auto_renew", "mark_manual"], default: "mark_manual" },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reason: { type: String, default: "" },
      }],
      default: [],
    },
    renewalHistory: {
      type: [{
        renewedAt: { type: Date, default: Date.now },
        previousExpiresAt: { type: Date, default: null },
        newExpiresAt: { type: Date, default: null },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reason: { type: String, default: "" },
        note: { type: String, default: "" },
      }],
      default: [],
    },
    upgradeHistory: {
      type: [{
        changedAt: { type: Date, default: Date.now },
        fromPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
        toPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
        fromAllowedSites: { type: Number, default: 0 },
        toAllowedSites: { type: Number, default: 0 },
        fromPlanType: { type: String, default: "" },
        toPlanType: { type: String, default: "" },
        changeType: { type: String, enum: ["upgrade", "downgrade", "transfer_plan"], default: "upgrade" },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reason: { type: String, default: "" },
        note: { type: String, default: "" },
      }],
      default: [],
    },
    transferHistory: {
      type: [{
        transferredAt: { type: Date, default: Date.now },
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        status: { type: String, enum: ["completed", "requested", "rejected"], default: "completed" },
        note: { type: String, default: "" },
      }],
      default: [],
    },
    // Admin notes
    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    // Track manual admin actions
    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    trialConvertedAt: { type: Date, default: null },
    lifetimeConvertedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    revokedAt:   { type: Date, default: null },
    activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expiredBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    revokedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Compound indexes for common queries
licenseSchema.index({ userId: 1, status: 1 });
licenseSchema.index({ productId: 1, status: 1 });
licenseSchema.index({ userId: 1, createdAt: -1 });
licenseSchema.index({ userId: 1, status: 1, createdAt: -1 });
licenseSchema.index({ productId: 1, status: 1, createdAt: -1 });
licenseSchema.index({ status: 1, createdAt: -1 });
licenseSchema.index({ licenseType: 1, status: 1 });
licenseSchema.index({ planId: 1 });
licenseSchema.index({ "activeDomains.domain": 1 });
licenseSchema.index({ expiresAt: 1 }, { sparse: true });
licenseSchema.index({ orderId: 1 });

// Virtual: number of used sites
licenseSchema.virtual("usedSites").get(function () {
  return this.activeDomains.length;
});

// Virtual: is license expired (by date)
licenseSchema.virtual("isExpiredByDate").get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

licenseSchema.set("toObject", { virtuals: true });
licenseSchema.set("toJSON",   { virtuals: true });

module.exports = mongoose.model("License", licenseSchema);
