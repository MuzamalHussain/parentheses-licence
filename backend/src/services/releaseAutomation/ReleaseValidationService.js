const crypto = require("crypto");
const fs = require("fs");
const { validatePluginZip, ZipValidationError } = require("../../utils/pluginZipValidator");

function checksumFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function validateArtifact({ filePath, product, versionNumber }) {
  const results = [];
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: "failed",
      results: [{ name: "artifact_exists", status: "failed", message: "Release artifact is missing." }],
      artifact: {},
    };
  }

  const stat = fs.statSync(filePath);
  let zip;
  try {
    zip = validatePluginZip(filePath, {
      expectedSlug: product.pluginSlug || product.slug,
      expectedVersion: versionNumber,
    });
    results.push({ name: "zip_integrity", status: "passed", message: "ZIP archive is structurally valid.", metadata: zip });
    results.push({ name: "plugin_header", status: "passed", message: "WordPress plugin header is valid." });
    results.push({ name: "plugin_slug", status: "passed", message: "Plugin slug matches product metadata." });
    results.push({ name: "plugin_version", status: "passed", message: "Plugin version matches release tag." });
  } catch (err) {
    const code = err instanceof ZipValidationError ? err.code : "artifact_validation_failed";
    results.push({ name: code, status: "failed", message: err.message, metadata: err.metadata || {} });
  }

  const [checksumSha256, checksumMd5] = await Promise.all([
    checksumFile(filePath, "sha256"),
    checksumFile(filePath, "md5"),
  ]);
  results.push({ name: "checksums", status: "passed", message: "Checksums generated.", metadata: { checksumSha256, checksumMd5 } });

  const failed = results.some((item) => item.status === "failed");
  return {
    status: failed ? "failed" : "passed",
    results,
    artifact: {
      path: filePath,
      fileName: filePath.split(/[\\/]/).pop(),
      fileSizeBytes: stat.size,
      checksumSha256,
      checksumMd5,
      pluginSlug: zip?.rootFolder || product.pluginSlug || product.slug || "",
      pluginVersion: zip?.version || versionNumber,
      mainPluginFile: zip?.mainPluginFile || "",
    },
  };
}

function validatePipelineTransition(current, next) {
  const allowed = {
    draft: ["validated", "archived"],
    validated: ["ready", "archived"],
    ready: ["published", "archived"],
    published: ["archived"],
    archived: [],
  };
  return allowed[current]?.includes(next);
}

module.exports = { validateArtifact, validatePipelineTransition };
