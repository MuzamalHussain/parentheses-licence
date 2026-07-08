const mongoose = require("mongoose");

const identityAuditEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["success", "denied", "failed", "pending"],
      default: "success",
      index: true,
    },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

identityAuditEventSchema.index({ organizationId: 1, createdAt: -1 });
identityAuditEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("IdentityAuditEvent", identityAuditEventSchema);
