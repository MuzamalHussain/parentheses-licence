const REQUIRED_FIELDS = ["id", "name", "version", "author", "description", "entryPoint", "permissions", "platformVersion", "sdkVersion"];

function normalizeManifest(input = {}) {
  return {
    id: String(input.id || "").trim().toLowerCase(),
    name: String(input.name || "").trim(),
    version: String(input.version || "0.1.0").trim(),
    author: String(input.author || "").trim(),
    description: String(input.description || "").trim(),
    entryPoint: String(input.entryPoint || "index.js").trim(),
    permissions: Array.from(new Set((input.permissions || []).map((permission) => String(permission).trim()).filter(Boolean))).sort(),
    dependencies: Array.from(new Set((input.dependencies || []).map((dependency) => String(dependency).trim().toLowerCase()).filter(Boolean))).sort(),
    platformVersion: String(input.platformVersion || ">=1.0.0").trim(),
    sdkVersion: String(input.sdkVersion || "v1").trim(),
    requiredModules: Array.from(new Set((input.requiredModules || []).map((module) => String(module).trim()).filter(Boolean))).sort(),
    signature: input.signature || null,
    publisher: input.publisher || { id: "", verified: false },
  };
}

function validate(input = {}) {
  const manifest = normalizeManifest(input);
  const errors = [];
  REQUIRED_FIELDS.forEach((field) => {
    if (field === "permissions") {
      if (!manifest.permissions.length) errors.push("permissions_required");
    } else if (!manifest[field]) errors.push(`${field}_required`);
  });
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/.test(manifest.id)) errors.push("extension_id_invalid");
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) errors.push("version_invalid");
  if (manifest.entryPoint.includes("..") || manifest.entryPoint.startsWith("/")) errors.push("entry_point_unsafe");
  return { valid: errors.length === 0, errors, manifest };
}

module.exports = { normalizeManifest, validate };
