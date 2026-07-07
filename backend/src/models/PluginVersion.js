const mongoose = require("mongoose");

const pluginVersionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    versionNumber: {
      type: String,
      required: [true, "Version number is required"],
      trim: true,
      match: [/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, "Version must be valid semver, e.g. 1.4.2"],
    },
    versionName: { type: String, trim: true, default: "", maxlength: 150 },
    status: {
      type: String,
      enum: ["draft", "published", "hidden", "archived", "deprecated"],
      default: "draft",
      index: true,
    },
    releaseChannel: {
      type: String,
      enum: ["stable", "release_candidate", "beta", "alpha", "internal", "deprecated"],
      default: "stable",
      index: true,
    },
    description: { type: String, default: "", maxlength: 5000 },
    changelog: { type: String, default: "", maxlength: 10000 },
    changelogSections: {
      newFeatures: { type: String, default: "", maxlength: 5000 },
      improvements: { type: String, default: "", maxlength: 5000 },
      bugFixes: { type: String, default: "", maxlength: 5000 },
      securityFixes: { type: String, default: "", maxlength: 5000 },
      breakingChanges: { type: String, default: "", maxlength: 5000 },
      developerNotes: { type: String, default: "", maxlength: 5000 },
    },
    releaseNotes: { type: String, default: "", maxlength: 20000 },
    zipFilePath: {
      type: String,
      required: true,
    },
    fileSizeBytes: { type: Number, default: 0 },
    originalFileName: { type: String, default: "" },
    checksum: {
      type: String,
      default: "",
      match: [/^[a-fA-F0-9]{64}$|^$/, "SHA-256 checksum must be 64 hex characters"],
    },
    checksumMd5: {
      type: String,
      default: "",
      match: [/^[a-fA-F0-9]{32}$|^$/, "MD5 checksum must be 32 hex characters"],
    },
    assets: {
      type: [{
        type: {
          type: String,
          enum: ["plugin_zip", "documentation_pdf", "release_notes", "checksum", "developer_package"],
          default: "plugin_zip",
        },
        storageProvider: { type: String, default: "local" },
        path: { type: String, default: "" },
        fileName: { type: String, default: "" },
        contentType: { type: String, default: "" },
        fileSizeBytes: { type: Number, default: 0 },
        checksumSha256: { type: String, default: "" },
        checksumMd5: { type: String, default: "" },
      }],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    isLatest: {
      type: Boolean,
      default: false,
      index: true,
    },
    downloadCount: { type: Number, default: 0, min: 0 },
    minWpVersion: { type: String, default: "" },
    minPhpVersion: { type: String, default: "" },
    testedUpTo: { type: String, default: "" },
    pluginSlug: { type: String, lowercase: true, trim: true, default: "" },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releaseDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

pluginVersionSchema.pre("validate", function (next) {
  if (this.isPublished) {
    this.status = "published";
    this.releasedAt = this.releasedAt || new Date();
    this.releaseDate = this.releaseDate || this.releasedAt;
  }
  if (this.releaseChannel === "deprecated") this.status = "deprecated";
  next();
});

pluginVersionSchema.index({ productId: 1, versionNumber: 1 }, { unique: true });
pluginVersionSchema.index({ productId: 1, isPublished: 1, createdAt: -1 });
pluginVersionSchema.index({ productId: 1, releasedAt: -1, createdAt: -1 });
pluginVersionSchema.index({ productId: 1, status: 1, releaseChannel: 1 });
pluginVersionSchema.index({ productId: 1, isLatest: 1 });

module.exports = mongoose.model("PluginVersion", pluginVersionSchema);
