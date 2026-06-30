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
      required: true,
    },
    pluginVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PluginVersion",
      required: true,
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
    ipAddress: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

downloadSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Download", downloadSchema);
