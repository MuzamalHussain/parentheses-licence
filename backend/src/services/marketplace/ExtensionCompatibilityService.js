const supportedModules = ["licensing", "organizations", "payments", "notifications", "ai", "webhooks", "settings", "analytics", "storage", "developer_api"];
const platformVersion = "1.0.0";
const apiVersion = "v1";
const sdkVersion = "v1";

function validate(manifest, installed = []) {
  const warnings = [];
  const errors = [];
  if (manifest.sdkVersion !== sdkVersion) errors.push("sdk_version_incompatible");
  if (!String(manifest.platformVersion || "").includes("1") && !String(manifest.platformVersion || "").startsWith(">=")) {
    warnings.push("platform_version_range_unusual");
  }
  const missingModules = (manifest.requiredModules || []).filter((module) => !supportedModules.includes(module));
  if (missingModules.length) errors.push("required_modules_missing");
  const installedIds = new Set(installed.map((extension) => extension.id));
  const missingDependencies = (manifest.dependencies || []).filter((dependency) => !installedIds.has(dependency));
  if (missingDependencies.length) errors.push("dependencies_missing");
  const dependencyConflicts = installed.filter((extension) => extension.id === manifest.id && extension.version !== manifest.version);
  if (dependencyConflicts.length) warnings.push("version_update_available_or_conflict");
  return {
    compatible: errors.length === 0,
    errors,
    warnings,
    platformVersion,
    apiVersion,
    sdkVersion,
    missingModules,
    missingDependencies,
    dependencyConflicts: dependencyConflicts.map((extension) => ({ id: extension.id, version: extension.version })),
  };
}

module.exports = { apiVersion, platformVersion, sdkVersion, supportedModules, validate };
