const fs = require("fs");
const path = require("path");
const { getConfig } = require("../config/env");

function safeLocalPath(filePath) {
  const raw = String(filePath || "");
  if (!raw || raw.split(/[\\/]+/).includes("..")) return "";
  return path.normalize(raw);
}

function contentTypeFor(filename = "") {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".zip") return "application/zip";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".md" || extension === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

class LocalStorageAdapter {
  constructor() {
    this.provider = "local";
  }

  async stat(asset) {
    const normalizedPath = safeLocalPath(asset.path);
    if (!normalizedPath) return { exists: false };

    try {
      const stat = fs.statSync(normalizedPath);
      return {
        exists: stat.isFile(),
        size: stat.size,
        path: normalizedPath,
        contentType: asset.contentType || contentTypeFor(asset.fileName || normalizedPath),
      };
    } catch {
      return { exists: false };
    }
  }

  createReadStream(asset) {
    const normalizedPath = safeLocalPath(asset.path);
    return fs.createReadStream(normalizedPath);
  }
}

class S3CompatibleStorageAdapter {
  constructor(provider = "s3") {
    this.provider = provider;
  }

  async stat() {
    return { exists: false, unsupported: true };
  }

  createReadStream() {
    throw new Error(`${this.provider} download streaming is not configured in this deployment.`);
  }
}

class CloudflareR2StorageAdapter extends S3CompatibleStorageAdapter {
  constructor() {
    super("r2");
  }
}

class AzureBlobStorageAdapter extends S3CompatibleStorageAdapter {
  constructor() {
    super("azure_blob");
  }
}

class GoogleCloudStorageAdapter extends S3CompatibleStorageAdapter {
  constructor() {
    super("gcs");
  }
}

function getStorageAdapter(provider = getConfig().storage.provider) {
  const key = String(provider).toLowerCase();
  if (key === "s3") return new S3CompatibleStorageAdapter("s3");
  if (key === "r2" || key === "cloudflare_r2") return new CloudflareR2StorageAdapter();
  if (key === "azure" || key === "azure_blob") return new AzureBlobStorageAdapter();
  if (key === "gcs" || key === "google_cloud_storage") return new GoogleCloudStorageAdapter();
  return new LocalStorageAdapter();
}

module.exports = {
  AzureBlobStorageAdapter,
  CloudflareR2StorageAdapter,
  GoogleCloudStorageAdapter,
  LocalStorageAdapter,
  S3CompatibleStorageAdapter,
  getStorageAdapter,
  safeLocalPath,
  contentTypeFor,
};
