const mongoose = require("mongoose");

const legalHoldSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    reason: { type: String, trim: true, maxlength: 2000, default: "" },
    status: {
      type: String,
      enum: ["active", "released"],
      default: "active",
      index: true,
    },
    protectedResources: {
      type: [String],
      enum: ["users", "licenses", "orders", "downloads", "payments", "audit_logs", "all"],
      default: ["all"],
    },
    subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    enabledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    enabledAt: { type: Date, default: Date.now },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

legalHoldSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("LegalHold", legalHoldSchema);
