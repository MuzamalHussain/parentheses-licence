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
      // semver-ish: 1.2.3, 1.2.3-beta.1, etc.
      match: [/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, "Version must be valid semver, e.g. 1.4.2"],
    },
    changelog: {
      type: String,
      default: "",
      maxlength: 10000,
    },
    // Path on disk, NOT public — served only via signed download tokens.
    zipFilePath: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    originalFileName: {
      type: String,
      default: "",
    },
    checksum: {
      // SHA-256 of the uploaded file — lets the plugin verify integrity post-download.
      type: String,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Minimum WP/PHP compatibility info — useful for the update-check API.
    minWpVersion: { type: String, default: "" },
    minPhpVersion: { type: String, default: "" },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    releasedAt: {
      type: Date,
      default: null, // set when isPublished flips true
    },
  },
  { timestamps: true }
);

// One version number per product
pluginVersionSchema.index({ productId: 1, versionNumber: 1 }, { unique: true });
pluginVersionSchema.index({ productId: 1, isPublished: 1, createdAt: -1 });

module.exports = mongoose.model("PluginVersion", pluginVersionSchema);
