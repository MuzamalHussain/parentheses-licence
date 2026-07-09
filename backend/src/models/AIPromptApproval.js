const mongoose = require("mongoose");

const aiPromptApprovalSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    promptId: { type: mongoose.Schema.Types.ObjectId, ref: "AIPromptTemplate", required: true, index: true },
    key: { type: String, required: true, trim: true, index: true },
    version: { type: String, required: true, trim: true },
    status: { type: String, enum: ["draft", "review", "approved", "production", "archived", "rejected"], default: "draft", index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 2000 },
    rollbackFromVersion: { type: String, default: "" },
  },
  { timestamps: true }
);

aiPromptApprovalSchema.index({ organizationId: 1, key: 1, version: 1 }, { unique: true });
aiPromptApprovalSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AIPromptApproval", aiPromptApprovalSchema);
