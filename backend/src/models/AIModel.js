const mongoose = require("mongoose");

const aiModelSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true, trim: true, maxlength: 160 },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: ["enabled", "disabled", "deprecated"], default: "disabled", index: true },
    isDefault: { type: Boolean, default: false, index: true },
    category: {
      type: String,
      enum: ["general", "support", "licensing", "payments", "analytics", "fraud", "automation", "developer", "documentation"],
      default: "general",
      index: true,
    },
    modelTypes: {
      type: [String],
      enum: ["chat", "reasoning", "embeddings", "vision", "audio", "image_generation", "video"],
      default: ["chat"],
    },
    version: { type: String, trim: true, maxlength: 80, default: "" },
    contextWindow: { type: Number, min: 0, default: 0 },
    capabilities: { type: [String], default: [] },
    pricing: {
      promptPerMillion: { type: Number, min: 0, default: 0 },
      completionPerMillion: { type: Number, min: 0, default: 0 },
    },
    metadata: { type: Object, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

aiModelSchema.index({ organizationId: 1, providerId: 1, modelId: 1 }, { unique: true });
aiModelSchema.index({ organizationId: 1, status: 1, isDefault: 1 });

module.exports = mongoose.model("AIModel", aiModelSchema);
