const mongoose = require("mongoose");

const aiDeveloperSessionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: ["api", "sdk", "webhook", "plugin", "debug", "architecture", "code", "general"],
      default: "general",
      index: true,
    },
    question: { type: String, required: true, trim: true, maxlength: 5000 },
    answer: { type: String, required: true, maxlength: 30000 },
    contextSummary: { type: String, default: "", maxlength: 10000 },
    promptKey: { type: String, default: "", index: true },
    language: { type: String, default: "" },
    codeExamples: { type: mongoose.Schema.Types.Mixed, default: {} },
    references: { type: [mongoose.Schema.Types.Mixed], default: [] },
    safety: { type: mongoose.Schema.Types.Mixed, default: {} },
    promptTokens: { type: Number, min: 0, default: 0 },
    completionTokens: { type: Number, min: 0, default: 0 },
    totalTokens: { type: Number, min: 0, default: 0 },
    estimatedCost: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

aiDeveloperSessionSchema.index({ organizationId: 1, createdAt: -1 });
aiDeveloperSessionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AIDeveloperSession", aiDeveloperSessionSchema);
