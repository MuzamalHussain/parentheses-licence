const mongoose = require("mongoose");

const retentionRuleSchema = new mongoose.Schema(
  {
    resource: {
      type: String,
      enum: ["audit_logs", "orders", "licenses", "notifications", "downloads", "payments", "custom"],
      required: true,
    },
    retentionDays: { type: Number, min: 0, max: 3650, default: 365 },
    action: {
      type: String,
      enum: ["retain", "anonymize", "delete"],
      default: "retain",
    },
    enabled: { type: Boolean, default: true },
    customQuery: { type: Object, default: {} },
  },
  { _id: true }
);

const compliancePolicySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    gdpr: {
      allowPersonalDataExport: { type: Boolean, default: true },
      allowPersonalDataDeletion: { type: Boolean, default: true },
      anonymizeInsteadOfDelete: { type: Boolean, default: true },
      deletionReviewRequired: { type: Boolean, default: true },
    },
    privacy: {
      requireMarketingConsent: { type: Boolean, default: true },
      allowDataSharingOptOut: { type: Boolean, default: true },
      consentVersion: { type: String, trim: true, maxlength: 50, default: "1.0" },
    },
    retention: {
      auditLogRetentionDays: { type: Number, min: 0, max: 3650, default: 2555 },
      orderRetentionDays: { type: Number, min: 0, max: 3650, default: 2555 },
      licenseRetentionDays: { type: Number, min: 0, max: 3650, default: 2555 },
      notificationRetentionDays: { type: Number, min: 0, max: 3650, default: 365 },
      customRules: { type: [retentionRuleSchema], default: [] },
    },
    exports: {
      allowedFormats: {
        type: [String],
        enum: ["json", "csv"],
        default: ["json", "csv"],
      },
      maxRowsPerExport: { type: Number, min: 100, max: 100000, default: 25000 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompliancePolicy", compliancePolicySchema);
