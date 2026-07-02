const mongoose = require("mongoose");

// Immutable event log — one doc per activate/deactivate event
const licenseActivationSchema = new mongoose.Schema(
  {
    licenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "License",
      required: true,
      index: true,
    },
    domain:  { type: String, required: true, lowercase: true, trim: true },
    action:  { type: String, enum: ["activate", "deactivate"], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, default: "plugin" }, // "plugin" | "customer" | "admin"
    ipAddress: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

licenseActivationSchema.index({ licenseId: 1, createdAt: -1 });
licenseActivationSchema.index({ domain: 1, createdAt: -1 });
licenseActivationSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("LicenseActivation", licenseActivationSchema);
