const mongoose = require("mongoose");

const validationResultSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ["passed", "failed", "warning"], default: "passed" },
    message: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const releasePipelineSchema = new mongoose.Schema(
  {
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ReleaseRepository", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    pluginVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "PluginVersion", default: null, index: true },
    provider: { type: String, enum: ["github", "gitlab", "azure_devops"], default: "github", index: true },
    releaseTag: { type: String, required: true, trim: true, maxlength: 160 },
    releaseTitle: { type: String, trim: true, default: "", maxlength: 250 },
    releaseNotes: { type: String, default: "", maxlength: 20000 },
    changelog: { type: String, default: "", maxlength: 10000 },
    releaseDate: { type: Date, default: null },
    releaseChannel: {
      type: String,
      enum: ["alpha", "beta", "release_candidate", "stable"],
      default: "stable",
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "validated", "ready", "published", "archived"],
      default: "draft",
      index: true,
    },
    importStatus: {
      type: String,
      enum: ["pending", "imported", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    validationStatus: {
      type: String,
      enum: ["pending", "passed", "failed", "warning"],
      default: "pending",
      index: true,
    },
    validationResults: { type: [validationResultSchema], default: [] },
    build: {
      commitSha: { type: String, trim: true, default: "" },
      branch: { type: String, trim: true, default: "" },
      buildNumber: { type: String, trim: true, default: "" },
      buildTimestamp: { type: Date, default: null },
      githubReleaseId: { type: String, trim: true, default: "" },
      githubAssetId: { type: String, trim: true, default: "" },
    },
    artifact: {
      fileName: { type: String, trim: true, default: "" },
      path: { type: String, trim: true, default: "" },
      fileSizeBytes: { type: Number, default: 0 },
      checksumSha256: { type: String, trim: true, default: "" },
      checksumMd5: { type: String, trim: true, default: "" },
      pluginSlug: { type: String, trim: true, default: "" },
      pluginVersion: { type: String, trim: true, default: "" },
      mainPluginFile: { type: String, trim: true, default: "" },
    },
    wordpress: {
      readmeDetected: { type: Boolean, default: false },
      testedUpTo: { type: String, default: "" },
      requiresAtLeast: { type: String, default: "" },
      requiresPhp: { type: String, default: "" },
    },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

releasePipelineSchema.index({ productId: 1, releaseTag: 1 }, { unique: true });
releasePipelineSchema.index({ status: 1, importStatus: 1, createdAt: -1 });

module.exports = mongoose.model("ReleasePipeline", releasePipelineSchema);
