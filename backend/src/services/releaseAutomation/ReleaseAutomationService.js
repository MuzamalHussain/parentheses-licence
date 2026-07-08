const Product = require("../../models/Product");
const PluginVersion = require("../../models/PluginVersion");
const ReleaseRepository = require("../../models/ReleaseRepository");
const ReleasePipeline = require("../../models/ReleasePipeline");
const GitHubProvider = require("./GitHubReleaseProvider");
const ValidationService = require("./ReleaseValidationService");
const { writeAuditLog } = require("../../utils/auditLog");

const PROVIDERS = {
  github: GitHubProvider,
};

function makeError(message, statusCode = 422) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function audit(action, { actor, targetId = null, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({ actor, action, targetType: "ReleaseAutomation", targetId, metadata, ip, requestId });
}

async function connectRepository(input = {}, context = {}) {
  const provider = PROVIDERS[input.provider || "github"];
  if (!provider) throw makeError("Release provider is not supported.", 422);
  const product = await Product.findById(input.productId);
  if (!product) throw makeError("Product not found.", 404);
  const parsed = provider.parseRepository(input);
  const repository = await ReleaseRepository.findOneAndUpdate(
    { provider: provider.id, owner: parsed.owner, repo: parsed.repo },
    {
      $set: {
        provider: provider.id,
        productId: product._id,
        owner: parsed.owner,
        repo: parsed.repo,
        repositoryUrl: parsed.repositoryUrl,
        defaultBranch: input.defaultBranch || product.stableBranch || "main",
        status: "connected",
        selected: input.selected !== false,
        health: { status: "ok", checkedAt: new Date(), message: "Repository connection metadata is valid." },
        lastError: "",
        configuration: {
          webhookSecretConfigured: Boolean(input.webhookSecret),
          allowPrereleaseImports: input.allowPrereleaseImports !== false,
        },
        createdBy: context.actor?._id,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );
  await audit("release_repository.connected", { ...context, targetId: repository._id, metadata: { provider: provider.id, productId: product._id } });
  return repository;
}

async function repositoryHealth(repositoryId, context = {}) {
  const repository = await ReleaseRepository.findById(repositoryId);
  if (!repository) throw makeError("Repository not found.", 404);
  repository.health = { status: repository.repositoryUrl ? "ok" : "error", checkedAt: new Date(), message: repository.repositoryUrl ? "Repository metadata is complete." : "Repository URL is missing." };
  repository.status = repository.health.status === "ok" ? "connected" : "error";
  repository.lastSyncAt = new Date();
  await repository.save();
  await audit("release_repository.health_checked", { ...context, targetId: repository._id, metadata: { status: repository.health.status } });
  return repository;
}

async function importRelease(repositoryId, payload = {}, context = {}) {
  const repository = await ReleaseRepository.findById(repositoryId);
  if (!repository) throw makeError("Repository not found.", 404);
  const product = await Product.findById(repository.productId);
  if (!product) throw makeError("Product not found.", 404);
  const provider = PROVIDERS[repository.provider];
  const normalized = provider.normalizeReleasePayload(payload);
  if (!normalized.releaseTag || !normalized.versionNumber) throw makeError("Release tag must include a valid semantic version.", 422);

  const duplicate = await ReleasePipeline.findOne({ productId: product._id, releaseTag: normalized.releaseTag });
  if (duplicate) throw makeError("Release has already been imported for this product.", 409);

  const pipeline = await ReleasePipeline.create({
    repositoryId: repository._id,
    productId: product._id,
    provider: repository.provider,
    releaseTag: normalized.releaseTag,
    releaseTitle: normalized.releaseTitle,
    releaseNotes: normalized.releaseNotes,
    changelog: normalized.changelog,
    releaseDate: normalized.releaseDate ? new Date(normalized.releaseDate) : new Date(),
    releaseChannel: normalized.releaseChannel,
    status: "draft",
    importStatus: "imported",
    build: normalized.build,
    triggeredBy: context.actor?._id || null,
  });

  if (payload.assetPath) {
    const validation = await ValidationService.validateArtifact({
      filePath: payload.assetPath,
      product,
      versionNumber: normalized.versionNumber,
    });
    pipeline.validationStatus = validation.status;
    pipeline.validationResults = validation.results;
    pipeline.artifact = validation.artifact;
    pipeline.status = validation.status === "passed" ? "validated" : "draft";
    if (validation.status === "failed") {
      await audit("release_validation.failed", { ...context, targetId: pipeline._id, metadata: { releaseTag: pipeline.releaseTag } });
    } else {
      const version = await PluginVersion.create({
        productId: product._id,
        versionNumber: normalized.versionNumber,
        versionName: normalized.releaseTitle,
        status: "draft",
        releaseChannel: normalized.releaseChannel,
        description: normalized.releaseNotes,
        changelog: normalized.changelog,
        releaseNotes: normalized.releaseNotes,
        zipFilePath: validation.artifact.path,
        fileSizeBytes: validation.artifact.fileSizeBytes,
        originalFileName: validation.artifact.fileName,
        checksum: validation.artifact.checksumSha256,
        checksumMd5: validation.artifact.checksumMd5,
        assets: [{
          type: "plugin_zip",
          storageProvider: "local",
          path: validation.artifact.path,
          fileName: validation.artifact.fileName,
          contentType: "application/zip",
          fileSizeBytes: validation.artifact.fileSizeBytes,
          checksumSha256: validation.artifact.checksumSha256,
          checksumMd5: validation.artifact.checksumMd5,
        }],
        isPublished: false,
        isLatest: false,
        pluginSlug: validation.artifact.pluginSlug,
        uploadedBy: context.actor?._id,
        uploadedAt: new Date(),
        releasedAt: null,
        releaseDate: normalized.releaseDate ? new Date(normalized.releaseDate) : null,
        sourceProvider: repository.provider,
        sourceRepositoryId: repository._id,
        sourceReleasePipelineId: pipeline._id,
        buildMetadata: {
          ...normalized.build,
          releaseTag: normalized.releaseTag,
        },
      });
      pipeline.pluginVersionId = version._id;
    }
    await pipeline.save();
  }

  repository.lastSyncAt = new Date();
  await repository.save();
  await audit("release.imported", { ...context, targetId: pipeline._id, metadata: { repositoryId, releaseTag: pipeline.releaseTag, channel: pipeline.releaseChannel } });
  return pipeline;
}

async function validatePipeline(pipelineId, context = {}) {
  const pipeline = await ReleasePipeline.findById(pipelineId).populate("productId");
  if (!pipeline) throw makeError("Release pipeline not found.", 404);
  const validation = await ValidationService.validateArtifact({
    filePath: pipeline.artifact?.path,
    product: pipeline.productId,
    versionNumber: pipeline.artifact?.pluginVersion || GitHubProvider.inferVersion(pipeline.releaseTag),
  });
  pipeline.validationStatus = validation.status;
  pipeline.validationResults = validation.results;
  pipeline.artifact = { ...pipeline.artifact, ...validation.artifact };
  pipeline.status = validation.status === "passed" ? "validated" : "draft";
  await pipeline.save();
  await audit(validation.status === "passed" ? "release.validated" : "release_validation.failed", { ...context, targetId: pipeline._id });
  return pipeline;
}

async function setPipelineStatus(pipelineId, status, context = {}) {
  const pipeline = await ReleasePipeline.findById(pipelineId);
  if (!pipeline) throw makeError("Release pipeline not found.", 404);
  if (!ValidationService.validatePipelineTransition(pipeline.status, status)) {
    throw makeError(`Cannot move release pipeline from ${pipeline.status} to ${status}.`, 409);
  }
  pipeline.status = status;
  if (status === "published") {
    const existing = await PluginVersion.findOne({ productId: pipeline.productId, versionNumber: pipeline.artifact.pluginVersion || GitHubProvider.inferVersion(pipeline.releaseTag) });
    if (existing) pipeline.pluginVersionId = existing._id;
  }
  await pipeline.save();
  await audit(status === "published" ? "release.published" : "release.pipeline_triggered", { ...context, targetId: pipeline._id, metadata: { status } });
  return pipeline;
}

async function dashboard(filters = {}) {
  const repoFilter = filters.productId ? { productId: filters.productId } : {};
  const pipelineFilter = filters.productId ? { productId: filters.productId } : {};
  if (filters.status) pipelineFilter.status = filters.status;
  const [repositories, pipelines] = await Promise.all([
    ReleaseRepository.find(repoFilter).sort({ updatedAt: -1 }).limit(100).lean(),
    ReleasePipeline.find(pipelineFilter).sort({ createdAt: -1 }).limit(100).populate("productId", "name slug").lean(),
  ]);
  return {
    repositories,
    pipelines,
    stats: {
      repositories: repositories.length,
      connected: repositories.filter((item) => item.status === "connected").length,
      pipelines: pipelines.length,
      ready: pipelines.filter((item) => item.status === "ready").length,
      failed: pipelines.filter((item) => item.validationStatus === "failed").length,
    },
    providers: [
      { id: "github", name: "GitHub", status: "available" },
      { id: "gitlab", name: "GitLab CI", status: "planned" },
      { id: "azure_devops", name: "Azure DevOps", status: "planned" },
    ],
  };
}

module.exports = {
  connectRepository,
  repositoryHealth,
  importRelease,
  validatePipeline,
  setPipelineStatus,
  dashboard,
};
