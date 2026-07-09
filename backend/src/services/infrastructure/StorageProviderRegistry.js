const { getConfig } = require("../../config/env");

const providers = [
  { id: "local", name: "Local Storage", configured: true, cdnReady: false },
  { id: "s3", name: "Amazon S3 Compatible", configured: false, cdnReady: true },
  { id: "r2", name: "Cloudflare R2", configured: false, cdnReady: true },
  { id: "azure_blob", name: "Azure Blob Storage", configured: false, cdnReady: true },
  { id: "gcs", name: "Google Cloud Storage", configured: false, cdnReady: true },
  { id: "future", name: "Future Providers", configured: false, cdnReady: true },
];

function describe() {
  const active = String(getConfig().storage.provider || "local").toLowerCase();
  return {
    activeProvider: active,
    providers: providers.map((provider) => ({ ...provider, configured: provider.id === active || provider.configured })),
    abstractionReady: true,
    futureCdnSupport: true,
  };
}

module.exports = { describe, providers };
