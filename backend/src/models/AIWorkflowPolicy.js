const mongoose = require("mongoose");

const aiWorkflowPolicySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    scope: { type: String, enum: ["global", "organization", "role", "risk"], default: "organization", index: true },
    category: {
      type: String,
      enum: ["licensing", "payments", "renewals", "downloads", "organizations", "notifications", "support", "releases", "security", "developer_platform"],
      required: true,
      index: true,
    },
    mode: { type: String, enum: ["recommendation_only", "approval_required", "automatic_execution"], default: "approval_required", index: true },
    role: { type: String, default: "" },
    minRiskLevel: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    enabled: { type: Boolean, default: true, index: true },
    restrictedActions: { type: [String], default: ["suspend_license", "revoke_license", "delete_user", "revoke_api_key"] },
    maxAutomaticRiskLevel: { type: String, enum: ["low", "medium", "high", "critical"], default: "low" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

aiWorkflowPolicySchema.index({ organizationId: 1, category: 1, enabled: 1 });

module.exports = mongoose.model("AIWorkflowPolicy", aiWorkflowPolicySchema);
