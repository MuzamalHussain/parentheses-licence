const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const required = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
];

const expectations = {
  ".github/workflows/ci.yml": [
    "npm ci",
    "npm run lint",
    "npm run build",
    "npm test",
    "npm audit",
    "check:production-readiness",
    "upload-artifact",
  ],
  ".github/workflows/release.yml": [
    "tags:",
    "npm run verify:release",
    "npm run artifacts:validate",
    "npm audit",
    "upload-artifact",
    "softprops/action-gh-release",
  ],
};

const failures = [];
for (const file of required) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file} is missing`);
    continue;
  }
  const content = fs.readFileSync(fullPath, "utf8");
  for (const expected of expectations[file]) {
    if (!content.includes(expected)) failures.push(`${file} missing '${expected}'`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Workflow verification passed.");
