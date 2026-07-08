const mongoose = require("mongoose");

const mfaMethodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    method: {
      type: String,
      enum: ["totp", "recovery_code", "backup_recovery"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "enabled", "disabled"],
      default: "pending",
      index: true,
    },
    label: { type: String, trim: true, maxlength: 120, default: "" },
    secretEncrypted: { type: String, select: false },
    recoveryCodeHashes: { type: [String], select: false, default: [] },
    lastUsedAt: { type: Date },
    enabledAt: { type: Date },
    disabledAt: { type: Date },
  },
  { timestamps: true }
);

mfaMethodSchema.index({ userId: 1, organizationId: 1, method: 1 }, { unique: true });

module.exports = mongoose.model("UserMfaMethod", mfaMethodSchema);
