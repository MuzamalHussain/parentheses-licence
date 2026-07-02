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
      enum: ["active", "suspended", "revoked", "expired"],
      default: "active",
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
    // Admin notes
    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    // Track manual admin actions
    suspendedAt: { type: Date, default: null },
    revokedAt:   { type: Date, default: null },
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
licenseSchema.index({ planId: 1 });
licenseSchema.index({ "activeDomains.domain": 1 });
licenseSchema.index({ expiresAt: 1 }, { sparse: true });
licenseSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: "objectId" } },
  }
);

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
