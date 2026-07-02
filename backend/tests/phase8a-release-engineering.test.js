const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const backendRoot = path.resolve(__dirname, "..");
const root = path.resolve(backendRoot, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

async function testStandardizedNpmScriptsExist() {
  const rootPackage = readJson("package.json");
  const backendPackage = readJson("backend/package.json");
  const frontendPackage = readJson("frontend/package.json");
  const required = ["dev", "start", "build", "lint", "test", "typecheck"];

  for (const script of required) assert.ok(rootPackage.scripts[script], `root missing ${script}`);
  for (const script of required) assert.ok(backendPackage.scripts[script], `backend missing ${script}`);
  for (const script of ["dev", "build", "lint", "test", "typecheck"]) {
    assert.ok(frontendPackage.scripts[script], `frontend missing ${script}`);
  }
}

async function testGitHubActionsQualityGatesExist() {
  const ci = read(".github/workflows/ci.yml");
  const release = read(".github/workflows/release.yml");

  for (const expected of ["npm ci", "npm run lint", "npm run build", "npm test", "check:production-readiness", "upload-artifact"]) {
    assert.ok(ci.includes(expected), `CI missing ${expected}`);
  }
  for (const expected of ["tags:", "npm run verify:release", "npm run artifacts:validate", "softprops/action-gh-release"]) {
    assert.ok(release.includes(expected), `release missing ${expected}`);
  }
}

async function testWorkflowVerificationScriptPasses() {
  const result = spawnSync(process.execPath, ["scripts/verify-workflows.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

async function testReleaseSummaryGeneration() {
  const result = spawnSync(process.execPath, ["scripts/generate-release-summary.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const summaryPath = path.join(root, "artifacts/release-summary.json");
  const notesPath = path.join(root, "artifacts/release-notes.md");
  assert.ok(fs.existsSync(summaryPath));
  assert.ok(fs.existsSync(notesPath));
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.ok(summary.qualityGates.includes("production readiness check"));
}

async function testDeploymentValidationHookExists() {
  const backendPackage = readJson("backend/package.json");
  const deployment = read("DEPLOYMENT.md");

  assert.ok(backendPackage.scripts["check:production-readiness"]);
  assert.ok(deployment.includes("npm run check:production-readiness"));
  assert.ok(deployment.includes("/ready"));
}

async function run() {
  const tests = [
    testStandardizedNpmScriptsExist,
    testGitHubActionsQualityGatesExist,
    testWorkflowVerificationScriptPasses,
    testReleaseSummaryGeneration,
    testDeploymentValidationHookExists,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit(0));
