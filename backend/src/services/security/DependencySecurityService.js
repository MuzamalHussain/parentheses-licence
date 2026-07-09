const fs = require("fs");
const path = require("path");

function readPackage(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function dependencyRows(pkg, project) {
  return Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).map(([name, version]) => ({
    project,
    name,
    version,
    status: String(version).includes("*") || String(version).toLowerCase().includes("latest") ? "review" : "tracked",
    licenseConflict: false,
    knownVulnerability: "not_scanned",
  }));
}

function analyze(root = path.resolve(__dirname, "../../../..")) {
  const backend = readPackage(path.join(root, "backend", "package.json"));
  const frontend = readPackage(path.join(root, "frontend", "package.json"));
  const dependencies = [...dependencyRows(backend, "backend"), ...dependencyRows(frontend, "frontend")];
  return {
    total: dependencies.length,
    review: dependencies.filter((dep) => dep.status === "review").length,
    knownVulnerabilities: "requires_external_advisory_feed",
    outdatedPackages: "requires_registry_access",
    licenseConflicts: dependencies.filter((dep) => dep.licenseConflict).length,
    dependencyHealth: dependencies.every((dep) => dep.status !== "review") ? "tracked" : "review",
    dependencies,
  };
}

module.exports = { analyze };
