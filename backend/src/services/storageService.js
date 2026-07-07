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
  constructor() {
    this.provider = "s3";
  }

  async stat() {
    return { exists: false, unsupported: true };
  }

  createReadStream() {
    throw new Error("S3-compatible download streaming is not configured in this deployment.");
  }
}

function getStorageAdapter(provider = getConfig().storage.provider) {
  if (String(provider).toLowerCase() === "s3") return new S3CompatibleStorageAdapter();
  return new LocalStorageAdapter();
}

module.exports = {
  LocalStorageAdapter,
  S3CompatibleStorageAdapter,
  getStorageAdapter,
  safeLocalPath,
  contentTypeFor,
};
