const mongoose = require("mongoose");

const licenseSiteSchema = new mongoose.Schema(
  {
    licenseId: { type: mongoose.Schema.Types.ObjectId, ref: "License", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    siteName: { type: String, trim: true, default: "", maxlength: 150 },
    siteUrl: { type: String, trim: true, default: "", maxlength: 1000 },
    domain: { type: String, required: true, lowercase: true, trim: true, index: true },
    environment: {
      type: String,
      enum: ["production", "staging", "development", "localhost", "unknown"],
      default: "unknown",
      index: true,
    },
    pluginVersion: { type: String, trim: true, default: "", maxlength: 80 },
    wordpressVersion: { type: String, trim: true, default: "", maxlength: 80 },
    phpVersion: { type: String, trim: true, default: "", maxlength: 80 },
    activatedAt: { type: Date, default: Date.now },
    lastHeartbeatAt: { type: Date, default: null, index: true },
    lastValidationAt: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    lastLicenseStatus: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive", "disconnected", "suspended", "revoked", "expired"],
      default: "active",
      index: true,
    },
    whitelisted: { type: Boolean, default: false },
    blacklisted: { type: Boolean, default: false, index: true },
    lastHeartbeatNonce: { type: String, default: "" },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspendedAt: { type: Date, default: null },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

licenseSiteSchema.index({ licenseId: 1, domain: 1 }, { unique: true });
licenseSiteSchema.index({ licenseId: 1, status: 1, updatedAt: -1 });
licenseSiteSchema.index({ userId: 1, status: 1, updatedAt: -1 });
licenseSiteSchema.index({ productId: 1, environment: 1 });

module.exports = mongoose.model("LicenseSite", licenseSiteSchema);
