const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const required = [
  "frontend/dist/index.html",
  "artifacts/release-summary.json",
  "artifacts/release-notes.md",
  "artifacts/known-issues.md",
  "artifacts/upgrade-notes.md",
  "artifacts/production-checklist.md",
  "artifacts/enterprise-certification.json",
  "artifacts/enterprise-certification.md",
  "artifacts/technical-debt.md",
  "artifacts/migration-notes.md",
  "artifacts/installation-guide.md",
  "docs/ARCHITECTURE_OVERVIEW.md",
  "docs/BACKUP_GUIDE.md",
  "docs/RECOVERY_GUIDE.md",
  "docs/DEVELOPER_GUIDE.md",
  "docs/SDK_GUIDE.md",
  "docs/UPGRADE_GUIDE.md",
  "backend/package.json",
  "backend/Dockerfile",
  "frontend/Dockerfile",
];

const missing = required.filter((file) => !fs.existsSync(path.join(ROOT, file)));
if (missing.length) {
  console.error(`Missing release artifacts:\n${missing.join("\n")}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/release-summary.json"), "utf8"));
if (!summary.version || !summary.generatedAt) {
  console.error("release-summary.json is missing version or generatedAt.");
  process.exit(1);
}

const certification = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/enterprise-certification.json"), "utf8"));
if (!certification.version || !certification.scores || !certification.readinessVerdict) {
  console.error("enterprise-certification.json is incomplete.");
  process.exit(1);
}

console.log("Artifact validation passed.");
