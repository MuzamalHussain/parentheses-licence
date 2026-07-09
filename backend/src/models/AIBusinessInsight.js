const mongoose = require("mongoose");

const metricSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    value: { type: mongoose.Schema.Types.Mixed, default: 0 },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: 0 },
    changePercent: { type: Number, default: 0 },
  },
  { _id: false }
);

const aiBusinessInsightSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["executive_summary", "recommendation", "trend_report", "business_query"],
      required: true,
      index: true,
    },
    question: { type: String, trim: true, maxlength: 1000, default: "" },
    timeRange: {
      period: { type: String, default: "30d" },
      start: { type: Date, required: true },
      end: { type: Date, required: true },
      comparisonStart: { type: Date, default: null },
      comparisonEnd: { type: Date, default: null },
    },
    modules: { type: [String], default: [] },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    recommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    supportingMetrics: { type: [metricSchema], default: [] },
    dataSources: { type: [String], default: [] },
    confidenceLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    knownLimitations: { type: [String], default: [] },
    visualization: { type: mongoose.Schema.Types.Mixed, default: {} },
    providerId: { type: String, default: "" },
    modelId: { type: String, default: "" },
    promptTokens: { type: Number, min: 0, default: 0 },
    completionTokens: { type: Number, min: 0, default: 0 },
    totalTokens: { type: Number, min: 0, default: 0 },
    estimatedCost: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["generated", "failed"], default: "generated", index: true },
  },
  { timestamps: true }
);

aiBusinessInsightSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
aiBusinessInsightSchema.index({ generatedBy: 1, createdAt: -1 });

module.exports = mongoose.model("AIBusinessInsight", aiBusinessInsightSchema);
