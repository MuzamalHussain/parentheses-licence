const mongoose = require("mongoose");
const { PRODUCT_STATUS } = require("../utils/constants");

function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCode(text) {
  return text.toString().trim().toUpperCase();
}

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: 150,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    internalProductCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      maxlength: 80,
      match: [/^[A-Z0-9._-]+$/, "Internal product code can only contain letters, numbers, dots, underscores, and dashes"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },
    shortDescription: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS),
      default: PRODUCT_STATUS.ACTIVE,
    },
    price: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "USD", maxlength: 3 },
    licenseType: {
      type: String,
      enum: ["single_site", "multi_site", "unlimited", "subscription", "lifetime"],
      default: "single_site",
    },
    lifetimeSupport: { type: Boolean, default: false },
    lifetimeUpdates: { type: Boolean, default: false },
    renewalSupported: { type: Boolean, default: true },
    upgradeSupported: { type: Boolean, default: true },
    pluginSlug: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 150,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Plugin slug must be lowercase words separated by dashes"],
    },
    pluginFolder: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 150,
      match: [/^[a-z0-9][a-z0-9._-]*$/, "Plugin folder can only contain letters, numbers, dots, underscores, and dashes"],
    },
    mainPluginFile: {
      type: String,
      trim: true,
      maxlength: 150,
      match: [/^[A-Za-z0-9._-]+\.php$/, "Main plugin file must be a PHP file name"],
    },
    textDomain: { type: String, trim: true, lowercase: true, maxlength: 150 },
    minPhpVersion: { type: String, trim: true, default: "" },
    minWpVersion: { type: String, trim: true, default: "" },
    testedUpTo: { type: String, trim: true, default: "" },
    productLogo: { type: String, trim: true, default: "" },
    productBanner: { type: String, trim: true, default: "" },
    featuredImage: { type: String, trim: true, default: "" },
    supportedPlatforms: { type: [String], default: [] },
    supportedPhpVersions: { type: [String], default: [] },
    supportedWpVersions: { type: [String], default: [] },
    dependencies: { type: [String], default: [] },
    defaultReleaseChannel: {
      type: String,
      enum: ["stable", "beta", "alpha"],
      default: "stable",
    },
    stableBranch: { type: String, trim: true, default: "main", maxlength: 120 },
    betaEnabled: { type: Boolean, default: false },
    alphaEnabled: { type: Boolean, default: false },
    downloadEnabled: { type: Boolean, default: true },
    publicDownloadDisabled: { type: Boolean, default: false },
    licenseRequired: { type: Boolean, default: true },
    productUrl: { type: String, trim: true, default: "" },
    metaTitle: { type: String, trim: true, default: "", maxlength: 150 },
    metaDescription: { type: String, trim: true, default: "", maxlength: 320 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

productSchema.pre("validate", function (next) {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name);
  } else if (this.slug) {
    this.slug = slugify(this.slug);
  }
  if (this.pluginSlug) this.pluginSlug = slugify(this.pluginSlug);
  if (this.pluginFolder) this.pluginFolder = this.pluginFolder.toString().trim().toLowerCase();
  if (this.textDomain) this.textDomain = this.textDomain.toString().trim().toLowerCase();
  if (this.internalProductCode) this.internalProductCode = normalizeCode(this.internalProductCode);
  next();
});

productSchema.index({ status: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ defaultReleaseChannel: 1, status: 1 });
productSchema.index({ name: "text", slug: "text", internalProductCode: "text" });
productSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
