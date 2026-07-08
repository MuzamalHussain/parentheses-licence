const mongoose = require("mongoose");

const releaseRepositorySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["github", "gitlab", "azure_devops"],
      default: "github",
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    owner: { type: String, required: true, trim: true, maxlength: 120 },
    repo: { type: String, required: true, trim: true, maxlength: 160 },
    repositoryUrl: { type: String, required: true, trim: true, maxlength: 500 },
    defaultBranch: { type: String, trim: true, default: "main", maxlength: 120 },
    status: {
      type: String,
      enum: ["connected", "disconnected", "pending", "error", "disabled"],
      default: "pending",
      index: true,
    },
    health: {
      status: { type: String, default: "unknown" },
      checkedAt: { type: Date, default: null },
      message: { type: String, default: "" },
    },
    selected: { type: Boolean, default: true },
    lastSyncAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    configuration: {
      webhookSecretConfigured: { type: Boolean, default: false },
      allowPrereleaseImports: { type: Boolean, default: true },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

releaseRepositorySchema.index({ provider: 1, owner: 1, repo: 1 }, { unique: true });
releaseRepositorySchema.index({ productId: 1, selected: 1 });

module.exports = mongoose.model("ReleaseRepository", releaseRepositorySchema);
