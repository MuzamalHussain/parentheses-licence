const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "artifacts");
const rootPackage = require(path.join(ROOT, "package.json"));
const backendPackage = require(path.join(ROOT, "backend/package.json"));
const frontendPackage = require(path.join(ROOT, "frontend/package.json"));

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  version: rootPackage.version,
  packages: {
    root: rootPackage.version,
    backend: backendPackage.version,
    frontend: frontendPackage.version,
  },
  qualityGates: [
    "backend lint",
    "backend build syntax verification",
    "backend tests",
    "frontend lint",
    "frontend Vite build",
    "production readiness check",
    "workflow verification",
    "artifact validation",
  ],
};

fs.writeFileSync(path.join(ARTIFACT_DIR, "release-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "release-notes.md"),
  `# Parentheses Licence ${summary.version}\n\nGenerated: ${summary.generatedAt}\n\n## Quality Gates\n\n${summary.qualityGates.map((gate) => `- ${gate}`).join("\n")}\n`
);

console.log(`Release summary generated in ${path.relative(ROOT, ARTIFACT_DIR).replace(/\\/g, "/")}.`);
