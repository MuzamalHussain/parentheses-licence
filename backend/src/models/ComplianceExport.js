const mongoose = require("mongoose");

const complianceExportSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    format: { type: String, enum: ["json", "csv"], default: "json" },
    resources: {
      type: [String],
      enum: ["organizations", "users", "licenses", "orders", "downloads", "payments", "audit_logs"],
      default: ["organizations", "users", "licenses", "orders", "downloads", "payments", "audit_logs"],
    },
    status: {
      type: String,
      enum: ["requested", "completed", "failed"],
      default: "requested",
      index: true,
    },
    rowCounts: { type: Object, default: {} },
    checksumSha256: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    failureReason: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

complianceExportSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("ComplianceExport", complianceExportSchema);
