const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorRole:  { type: String, default: "system" },
    actorEmail: { type: String, default: "" },
    action:     { type: String, required: true }, // e.g. "license.suspended"
    targetType: { type: String, default: "" },    // "License" | "User" | "Product"
    targetId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress:  { type: String, default: "" },
  },
  { timestamps: true }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
