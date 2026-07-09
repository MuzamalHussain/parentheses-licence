const mongoose = require("mongoose");

const planStepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    eventName: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    restricted: { type: Boolean, default: false },
  },
  { _id: false }
);

const aiWorkflowApprovalSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    category: { type: String, required: true, index: true },
    templateKey: { type: String, required: true, index: true },
    mode: { type: String, enum: ["recommendation_only", "approval_required", "automatic_execution"], default: "approval_required" },
    status: { type: String, enum: ["pending", "approved", "rejected", "executed", "expired"], default: "pending", index: true },
    title: { type: String, required: true, maxlength: 200 },
    reason: { type: String, required: true, maxlength: 2000 },
    supportingEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    confidenceScore: { type: Number, min: 0, max: 100, default: 50 },
    expectedOutcome: { type: String, default: "", maxlength: 1000 },
    affectedResources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    plan: { type: [planStepSchema], default: [] },
    policySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    workflowResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 86400000), index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    executedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiWorkflowApprovalSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
aiWorkflowApprovalSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model("AIWorkflowApproval", aiWorkflowApprovalSchema);
