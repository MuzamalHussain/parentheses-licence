const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    metric: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: 0 },
    threshold: { type: mongoose.Schema.Types.Mixed, default: null },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const factorSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    weight: { type: Number, min: 0, default: 0 },
    score: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const aiFraudRiskSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entityType: {
      type: String,
      enum: ["organization", "license", "account", "download", "payment", "api_key", "platform"],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    riskLevel: { type: String, enum: ["low", "medium", "high", "critical"], required: true, index: true },
    score: { type: Number, min: 0, max: 100, required: true },
    confidenceLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    evidence: { type: [evidenceSchema], default: [] },
    contributingFactors: { type: [factorSchema], default: [] },
    recommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    timeRange: {
      period: { type: String, default: "7d" },
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open", index: true },
  },
  { timestamps: true }
);

aiFraudRiskSchema.index({ organizationId: 1, riskLevel: 1, createdAt: -1 });
aiFraudRiskSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model("AIFraudRisk", aiFraudRiskSchema);
