const mongoose = require("mongoose");

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
    contentType: { type: String, trim: true, default: "" },
    fileSizeBytes: { type: Number, default: 0, min: 0 },
    storageKey: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const organizationBrandSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, unique: true, index: true },
    identity: {
      organizationName: { type: String, trim: true, default: "", maxlength: 150 },
      displayName: { type: String, trim: true, default: "", maxlength: 150 },
      tagline: { type: String, trim: true, default: "", maxlength: 240 },
      website: { type: String, trim: true, default: "" },
      supportUrl: { type: String, trim: true, default: "" },
      supportEmail: { type: String, trim: true, lowercase: true, default: "" },
    },
    assets: {
      primaryLogo: { type: assetSchema, default: () => ({}) },
      darkLogo: { type: assetSchema, default: () => ({}) },
      favicon: { type: assetSchema, default: () => ({}) },
      loginBackground: { type: assetSchema, default: () => ({}) },
      dashboardLogo: { type: assetSchema, default: () => ({}) },
      emailBanner: { type: assetSchema, default: () => ({}) },
      defaultAvatar: { type: assetSchema, default: () => ({}) },
    },
    theme: {
      primaryColor: { type: String, default: "#2563eb", match: HEX_COLOR },
      secondaryColor: { type: String, default: "#111827", match: HEX_COLOR },
      accentColor: { type: String, default: "#14b8a6", match: HEX_COLOR },
      successColor: { type: String, default: "#16a34a", match: HEX_COLOR },
      warningColor: { type: String, default: "#d97706", match: HEX_COLOR },
      dangerColor: { type: String, default: "#dc2626", match: HEX_COLOR },
      backgroundColor: { type: String, default: "#f9fafb", match: HEX_COLOR },
      sidebarColor: { type: String, default: "#ffffff", match: HEX_COLOR },
      headerColor: { type: String, default: "#ffffff", match: HEX_COLOR },
      buttonColor: { type: String, default: "#2563eb", match: HEX_COLOR },
    },
    typography: {
      fontFamily: { type: String, default: "Inter, system-ui, sans-serif", maxlength: 160 },
      baseFontSize: { type: Number, default: 16, min: 12, max: 20 },
      headingScale: { type: Number, default: 1.2, min: 1, max: 1.6 },
      borderRadius: { type: Number, default: 8, min: 0, max: 24 },
      spacingScale: { type: Number, default: 1, min: 0.75, max: 1.5 },
    },
    login: {
      welcomeText: { type: String, trim: true, default: "", maxlength: 300 },
      footerText: { type: String, trim: true, default: "", maxlength: 300 },
      links: [{
        label: { type: String, trim: true, maxlength: 80 },
        url: { type: String, trim: true, maxlength: 500 },
      }],
    },
    portal: {
      footerText: { type: String, trim: true, default: "", maxlength: 300 },
      navigationLabel: { type: String, trim: true, default: "", maxlength: 120 },
    },
    email: {
      senderName: { type: String, trim: true, default: "", maxlength: 120 },
      senderEmail: { type: String, trim: true, lowercase: true, default: "" },
      replyTo: { type: String, trim: true, lowercase: true, default: "" },
      headerHtml: { type: String, default: "", maxlength: 5000 },
      footerHtml: { type: String, default: "", maxlength: 5000 },
      signatureHtml: { type: String, default: "", maxlength: 5000 },
    },
    whiteLabel: {
      hideParenthesesBranding: { type: Boolean, default: false },
      hidePlatformReferences: { type: Boolean, default: false },
      hideVersionFooter: { type: Boolean, default: false },
      poweredByText: { type: String, trim: true, default: "Powered by Parentheses", maxlength: 160 },
    },
    domain: {
      customDomain: { type: String, trim: true, lowercase: true, default: "" },
      validationStatus: { type: String, enum: ["not_configured", "pending", "verified", "failed"], default: "not_configured" },
      sslReady: { type: Boolean, default: false },
      dnsTarget: { type: String, trim: true, default: "" },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

organizationBrandSchema.index({ "domain.customDomain": 1 }, { sparse: true });

module.exports = mongoose.model("OrganizationBrand", organizationBrandSchema);
