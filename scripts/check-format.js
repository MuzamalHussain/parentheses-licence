const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INCLUDED_EXTENSIONS = new Set([".js", ".jsx", ".json", ".md", ".yml", ".yaml"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "uploads", "logs", "backups"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (INCLUDED_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

const failures = [];
for (const file of walk(ROOT)) {
  const rel = relative(file);
  const content = fs.readFileSync(file, "utf8");
  if (!content.endsWith("\n")) failures.push(`${rel} is missing trailing newline`);
  if (content.includes("\t")) failures.push(`${rel} contains tab indentation`);
  if (!rel.endsWith("check-format.js") && !rel.endsWith("lint-js.js")) {
    if (content.includes("<<<<<<<") || content.includes(">>>>>>>")) failures.push(`${rel} contains merge conflict markers`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Format check passed for ${walk(ROOT).length} files.`);
