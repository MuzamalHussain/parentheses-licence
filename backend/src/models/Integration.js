const mongoose = require("mongoose");

const integrationSchema = new mongoose.Schema(
  {
    providerId: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "General", index: true },
    environment: { type: String, enum: ["sandbox", "live", "default"], default: "default" },
    version: { type: String, default: "0.1.0" },
    status: {
      type: String,
      enum: ["connected", "disconnected", "disabled", "pending", "error"],
      default: "disabled",
      index: true,
    },
    enabled: { type: Boolean, default: false, index: true },
    configuration: { type: mongoose.Schema.Types.Mixed, default: {} },
    encryptedSecrets: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    secretMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    capabilities: { type: [String], default: [] },
    lastSyncAt: { type: Date, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    lastConnectionTestAt: { type: Date, default: null },
    lastSuccessfulConnectionTestAt: { type: Date, default: null },
    lastConnectionLatencyMs: { type: Number, default: null },
    lastError: { type: String, default: "" },
    health: {
      status: { type: String, enum: ["ok", "degraded", "error", "unknown"], default: "unknown" },
      checkedAt: { type: Date, default: null },
      message: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

integrationSchema.index({ enabled: 1, status: 1 });

module.exports = mongoose.model("Integration", integrationSchema);
