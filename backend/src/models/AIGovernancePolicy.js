const mongoose = require("mongoose");

const aiGovernancePolicySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: ["active", "disabled", "draft"], default: "active", index: true },
    budgets: {
      globalMonthly: { type: Number, min: 0, default: 0 },
      organizationMonthly: { type: Number, min: 0, default: 0 },
      userMonthly: { type: Number, min: 0, default: 0 },
      dailyCost: { type: Number, min: 0, default: 0 },
      monthlyCost: { type: Number, min: 0, default: 0 },
      costAlertThresholdPercent: { type: Number, min: 1, max: 100, default: 80 },
    },
    routing: {
      strategy: { type: String, enum: ["priority", "failover", "cost", "latency", "health"], default: "priority" },
      requireHealthyProvider: { type: Boolean, default: true },
      allowFallback: { type: Boolean, default: true },
    },
    safety: {
      maskSensitiveData: { type: Boolean, default: true },
      validatePrompts: { type: Boolean, default: true },
      validateResponses: { type: Boolean, default: true },
      promptInjectionDetection: { type: Boolean, default: true },
      outputSafetyChecks: { type: Boolean, default: true },
    },
    approvals: {
      requirePromptApproval: { type: Boolean, default: true },
      requireModelApproval: { type: Boolean, default: false },
      requireHighCostApproval: { type: Boolean, default: true },
      highCostThreshold: { type: Number, min: 0, default: 10 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

aiGovernancePolicySchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model("AIGovernancePolicy", aiGovernancePolicySchema);
