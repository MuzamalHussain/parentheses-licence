const Product = require("../../models/Product");
const PluginVersion = require("../../models/PluginVersion");
const ReleasePipeline = require("../../models/ReleasePipeline");
const { AppError } = require("../../utils/errorHandler");

function text(value = "") {
  return String(value || "").trim();
}

function summarizeSection(label, value) {
  const body = text(value);
  return { label, present: Boolean(body), length: body.length, summary: body ? body.slice(0, 500) : "" };
}

async function loadRelease({ productId, versionId, organizationId }) {
  const product = await Product.findOne({ _id: productId, ...(organizationId ? { organizationId } : {}) }).lean();
  if (!product) throw new AppError("Product not found or not accessible.", 404);
  const version = await PluginVersion.findOne({ _id: versionId, productId }).lean();
  if (!version) throw new AppError("Plugin version not found.", 404);
  const pipeline = version.sourceReleasePipelineId
    ? await ReleasePipeline.findById(version.sourceReleasePipelineId).lean().catch(() => null)
    : await ReleasePipeline.findOne({ pluginVersionId: version._id }).lean().catch(() => null);
  return { product, version, pipeline };
}

function analyze({ product, version, pipeline }) {
  const sections = version.changelogSections || {};
  const summaries = {
    features: summarizeSection("Features", sections.newFeatures),
    bugFixes: summarizeSection("Bug Fixes", sections.bugFixes),
    improvements: summarizeSection("Improvements", sections.improvements),
    securityFixes: summarizeSection("Security Fixes", sections.securityFixes),
    breakingChanges: summarizeSection("Breaking Changes", sections.breakingChanges),
    developerNotes: summarizeSection("Developer Notes", sections.developerNotes),
  };
  return {
    product: { id: product._id, name: product.name, slug: product.slug, pluginSlug: product.pluginSlug },
    version: {
      id: version._id,
      versionNumber: version.versionNumber,
      versionName: version.versionName,
      status: version.status,
      releaseChannel: version.releaseChannel,
      isPublished: version.isPublished,
      isLatest: version.isLatest,
      releaseDate: version.releaseDate || version.releasedAt,
      sourceProvider: version.sourceProvider,
    },
    fileStructure: {
      pluginSlug: version.pluginSlug,
      originalFileName: version.originalFileName,
      fileSizeBytes: version.fileSizeBytes,
      assetCount: (version.assets || []).length,
      checksumSha256Present: Boolean(version.checksum),
      checksumMd5Present: Boolean(version.checksumMd5),
    },
    releaseMetadata: {
      sourceProvider: version.sourceProvider,
      commitSha: version.buildMetadata?.commitSha || pipeline?.build?.commitSha || "",
      branch: version.buildMetadata?.branch || pipeline?.build?.branch || "",
      releaseTag: version.buildMetadata?.releaseTag || pipeline?.releaseTag || "",
      validationStatus: pipeline?.validationStatus || "not_available",
      pipelineStatus: pipeline?.status || "not_available",
    },
    changelog: {
      hasChangelog: Boolean(text(version.changelog)),
      hasReleaseNotes: Boolean(text(version.releaseNotes)),
      sections: summaries,
    },
    featureSummary: summaries.features.summary || summaries.improvements.summary || "No feature summary was provided.",
    bugFixSummary: summaries.bugFixes.summary || "No bug fix summary was provided.",
    securityFixSummary: summaries.securityFixes.summary || "No security fix summary was provided.",
  };
}

module.exports = { loadRelease, analyze };
