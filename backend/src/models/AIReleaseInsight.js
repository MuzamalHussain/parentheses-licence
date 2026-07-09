const mongoose = require("mongoose");

const aiReleaseInsightSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    pluginVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "PluginVersion", required: true, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    releaseAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    compatibility: { type: mongoose.Schema.Types.Mixed, default: {} },
    riskAssessment: { type: mongoose.Schema.Types.Mixed, default: {} },
    releaseNotes: { type: mongoose.Schema.Types.Mixed, default: {} },
    rolloutStrategy: { type: mongoose.Schema.Types.Mixed, default: {} },
    releaseHealth: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

aiReleaseInsightSchema.index({ productId: 1, pluginVersionId: 1, createdAt: -1 });
aiReleaseInsightSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("AIReleaseInsight", aiReleaseInsightSchema);
