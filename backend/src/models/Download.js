const mongoose = require("mongoose");

const downloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    licenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "License",
      default: null,
    },
    pluginVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PluginVersion",
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      index: true,
      default: null,
    },
    assetType: {
      type: String,
      enum: ["plugin_zip", "documentation_pdf", "release_notes", "checksum", "developer_package"],
      default: "plugin_zip",
      index: true,
    },
    assetPath: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSizeBytes: { type: Number, default: 0 },
    checksumSha256: { type: String, default: "" },
    checksumMd5: { type: String, default: "" },
    releaseChannel: {
      type: String,
      enum: ["stable", "release_candidate", "beta", "alpha", "internal", "deprecated"],
      default: "stable",
      index: true,
    },
    // The raw token is never stored — only its SHA-256 hash (same pattern as
    // password reset tokens). The token itself only ever lives in the URL.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL index — auto-deletes expired docs
    },
    usedAt: {
      type: Date,
      default: null,
    },
    purpose: {
      type: String,
      enum: ["customer_download", "wordpress_update"],
      default: "customer_download",
      index: true,
    },
    domain: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["requested", "authorized", "denied", "completed", "expired", "invalid_signature", "missing_file"],
      default: "authorized",
      index: true,
    },
    deniedReason: { type: String, default: "" },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: { type: String, default: "" },
    browser: { type: String, default: "" },
    platform: { type: String, default: "" },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

downloadSchema.index({ userId: 1, createdAt: -1 });
downloadSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
downloadSchema.index({ licenseId: 1, createdAt: -1 });
downloadSchema.index({ licenseId: 1, status: 1, createdAt: -1 });
downloadSchema.index({ pluginVersionId: 1, createdAt: -1 });
downloadSchema.index({ productId: 1, createdAt: -1 });
downloadSchema.index({ purpose: 1, usedAt: 1, expiresAt: 1 });
downloadSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
downloadSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model("Download", downloadSchema);
