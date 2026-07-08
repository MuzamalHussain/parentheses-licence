const mongoose = require("mongoose");

const securityPolicySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    authentication: {
      localLoginAllowed: { type: Boolean, default: true },
      socialLoginAllowed: { type: Boolean, default: false },
      ssoRequired: { type: Boolean, default: false },
      allowedMethods: {
        type: [String],
        enum: ["local", "oauth2", "oidc", "saml2"],
        default: ["local"],
      },
    },
    mfa: {
      required: { type: Boolean, default: false },
      allowedMethods: {
        type: [String],
        enum: ["totp", "recovery_code", "backup_recovery"],
        default: ["totp", "recovery_code"],
      },
      gracePeriodDays: { type: Number, min: 0, max: 90, default: 0 },
    },
    sessions: {
      lifetimeMinutes: { type: Number, min: 15, max: 43200, default: 10080 },
      idleTimeoutMinutes: { type: Number, min: 5, max: 1440, default: 480 },
      maxActiveSessions: { type: Number, min: 1, max: 50, default: 10 },
      revokeOnPasswordChange: { type: Boolean, default: true },
    },
    password: {
      minLength: { type: Number, min: 8, max: 128, default: 8 },
      requireUppercase: { type: Boolean, default: true },
      requireLowercase: { type: Boolean, default: true },
      requireNumber: { type: Boolean, default: true },
      requireSymbol: { type: Boolean, default: false },
      historyCount: { type: Number, min: 0, max: 24, default: 0 },
      expirationDays: { type: Number, min: 0, max: 730, default: 0 },
      lockoutAttempts: { type: Number, min: 3, max: 20, default: 5 },
    },
    network: {
      ipAllowlistEnabled: { type: Boolean, default: false },
      ipAllowlist: { type: [String], default: [] },
    },
    scim: {
      enabled: { type: Boolean, default: false },
      baseUrl: { type: String, trim: true, maxlength: 500, default: "" },
      tokenConfigured: { type: Boolean, default: false },
      groupSyncEnabled: { type: Boolean, default: false },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrganizationSecurityPolicy", securityPolicySchema);
