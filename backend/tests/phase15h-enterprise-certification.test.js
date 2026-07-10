const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function exists(file) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} should exist`);
}

function testCertificationArtifacts() {
  [
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
  ].forEach(exists);

  const certification = readJson("artifacts/enterprise-certification.json");
  assert.strictEqual(certification.version, "1.0.0");
  assert.strictEqual(certification.overallEnterpriseRating, "A-");
  assert.ok(certification.scores.security >= 90);
  assert.ok(certification.scores.productionReadiness >= 90);
  assert.deepStrictEqual(certification.criticalBlockers, []);
}

function testReleaseSummaryReferencesCertification() {
  const summary = readJson("artifacts/release-summary.json");
  assert.ok(summary.releaseArtifacts.includes("enterprise-certification.json"));
  assert.ok(summary.releaseArtifacts.includes("enterprise-certification.md"));
}

function run() {
  testCertificationArtifacts();
  testReleaseSummaryReferencesCertification();
  console.log("Phase 15H enterprise certification tests passed.");
}

run();
