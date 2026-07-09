const mongoose = require("mongoose");

const aiCommandCenterSnapshotSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    alerts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    health: { type: mongoose.Schema.Types.Mixed, default: {} },
    aiUsage: { type: mongoose.Schema.Types.Mixed, default: {} },
    workflow: { type: mongoose.Schema.Types.Mixed, default: {} },
    security: { type: mongoose.Schema.Types.Mixed, default: {} },
    business: { type: mongoose.Schema.Types.Mixed, default: {} },
    question: { type: String, default: "", maxlength: 1000 },
    answer: { type: String, default: "", maxlength: 5000 },
  },
  { timestamps: true }
);

aiCommandCenterSnapshotSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("AICommandCenterSnapshot", aiCommandCenterSnapshotSchema);
