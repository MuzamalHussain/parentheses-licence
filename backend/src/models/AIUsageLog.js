const mongoose = require("mongoose");

const aiUsageLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true, index: true },
    promptKey: { type: String, default: "" },
    requestType: { type: String, enum: ["chat", "reasoning", "embeddings", "vision", "audio", "image_generation", "video", "unknown"], default: "unknown" },
    promptTokens: { type: Number, min: 0, default: 0 },
    completionTokens: { type: Number, min: 0, default: 0 },
    totalTokens: { type: Number, min: 0, default: 0 },
    responseTimeMs: { type: Number, min: 0, default: 0 },
    estimatedCost: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["success", "failed", "fallback"], default: "success", index: true },
    errorCode: { type: String, default: "" },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

aiUsageLogSchema.index({ organizationId: 1, createdAt: -1 });
aiUsageLogSchema.index({ organizationId: 1, providerId: 1, modelId: 1, createdAt: -1 });
aiUsageLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AIUsageLog", aiUsageLogSchema);
