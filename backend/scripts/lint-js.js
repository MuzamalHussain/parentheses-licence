const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INCLUDED_DIRS = ["src", "scripts", "tests"];
const failures = [];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.name.endsWith(".js")) files.push(fullPath);
  }
  return files;
}

for (const file of INCLUDED_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))) {
  if (path.basename(file) === "lint-js.js") continue;
  const content = fs.readFileSync(file, "utf8");
  const relative = path.relative(ROOT, file).replace(/\\/g, "/");
  if (content.includes("<<<<<<<") || content.includes(">>>>>>>")) failures.push(`${relative}: merge conflict marker`);
  if (content.match(/\bfit\s*\(/)) failures.push(`${relative}: focused test fit()`);
  if (content.match(/\bit\.only\s*\(/)) failures.push(`${relative}: focused test it.only()`);
  if (content.match(/\bdescribe\.only\s*\(/)) failures.push(`${relative}: focused test describe.only()`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Backend lint passed.");
