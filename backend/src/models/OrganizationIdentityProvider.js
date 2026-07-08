const mongoose = require("mongoose");

const providerSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    provider: {
      type: String,
      enum: ["google_workspace", "microsoft_entra", "okta", "onelogin", "auth0", "oidc", "saml"],
      required: true,
      index: true,
    },
    protocol: {
      type: String,
      enum: ["oauth2", "oidc", "saml2"],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "enabled", "disabled", "error"],
      default: "draft",
      index: true,
    },
    domains: { type: [String], default: [] },
    configuration: {
      issuerUrl: { type: String, trim: true, maxlength: 500, default: "" },
      authorizationUrl: { type: String, trim: true, maxlength: 500, default: "" },
      tokenUrl: { type: String, trim: true, maxlength: 500, default: "" },
      userInfoUrl: { type: String, trim: true, maxlength: 500, default: "" },
      entityId: { type: String, trim: true, maxlength: 500, default: "" },
      ssoUrl: { type: String, trim: true, maxlength: 500, default: "" },
      certificateFingerprint: { type: String, trim: true, maxlength: 128, default: "" },
      clientId: { type: String, trim: true, maxlength: 250, default: "" },
      scopes: { type: [String], default: [] },
    },
    secretsConfigured: {
      clientSecret: { type: Boolean, default: false },
      signingCertificate: { type: Boolean, default: false },
    },
    lastTestedAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: 1000, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

providerSchema.index({ organizationId: 1, provider: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("OrganizationIdentityProvider", providerSchema);
