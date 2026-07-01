const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase7g_test_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase7g_test_refresh_secret";
process.env.ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT = "true";

const { validatePluginZip, ZipValidationError } = require("../src/utils/pluginZipValidator");

function dosTimeDate() {
  return { time: 0, date: 0 };
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.contents || "");
    const declaredCompressedSize = entry.compressedSize ?? data.length;
    const declaredUncompressedSize = entry.uncompressedSize ?? data.length;
    const { time, date } = dosTimeDate();

    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(declaredCompressedSize, 18);
    local.writeUInt32LE(declaredUncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(declaredCompressedSize, 20);
    central.writeUInt32LE(declaredUncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(entry.externalAttributes || 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function writeZip(entries) {
  const filePath = path.join(os.tmpdir(), `phase7g-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(filePath, makeZip(entries));
  return filePath;
}

function pluginMain(headers = {}) {
  const pluginName = headers.pluginName === undefined ? "Parentheses" : headers.pluginName;
  const version = headers.version === undefined ? "1.2.3" : headers.version;
  return `<?php
/**
 * Plugin Name: ${pluginName}
${version ? ` * Version: ${version}\n` : ""} */
`;
}

function validateFile(filePath, options = {}) {
  return validatePluginZip(filePath, {
    expectedSlug: "parentheses",
    expectedVersion: "1.2.3",
    maxFiles: 10,
    maxUncompressedBytes: 1024 * 1024,
    maxCompressionRatio: 20,
    ...options,
  });
}

function assertRejectsZip(entries, code, options) {
  const filePath = writeZip(entries);
  try {
    assert.throws(() => validateFile(filePath, options), (err) =>
      err instanceof ZipValidationError && err.code === code
    );
  } finally {
    fs.unlinkSync(filePath);
  }
}

function testValidWordPressPluginZipAccepted() {
  const filePath = writeZip([
    { name: "parentheses/" },
    { name: "parentheses/parentheses.php", contents: pluginMain() },
    { name: "parentheses/readme.txt", contents: "readme" },
  ]);

  try {
    const result = validateFile(filePath);
    assert.strictEqual(result.rootFolder, "parentheses");
    assert.strictEqual(result.mainPluginFile, "parentheses/parentheses.php");
    assert.strictEqual(result.version, "1.2.3");
  } finally {
    fs.unlinkSync(filePath);
  }
}

function testNonZipRejected() {
  const filePath = path.join(os.tmpdir(), `phase7g-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(filePath, "not a zip");
  try {
    assert.throws(() => validateFile(filePath), (err) =>
      err instanceof ZipValidationError && err.code === "invalid_zip"
    );
  } finally {
    fs.unlinkSync(filePath);
  }
}

function testTraversalRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain() },
    { name: "../escape.php", contents: "<?php" },
  ], "path_traversal");
}

function testAbsolutePathRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain() },
    { name: "/tmp/escape.php", contents: "<?php" },
  ], "absolute_path");
}

function testMissingPluginHeaderRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: "<?php echo 'no header';" },
  ], "missing_plugin_header");
}

function testMissingVersionHeaderRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain({ version: "" }) },
  ], "missing_version_header");
}

function testVersionMismatchRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain({ version: "9.9.9" }) },
  ], "version_mismatch");
}

function testSlugMismatchRejected() {
  assertRejectsZip([
    { name: "other-plugin/other-plugin.php", contents: pluginMain() },
  ], "slug_mismatch");
}

function testTooManyFilesRejected() {
  const entries = [{ name: "parentheses/parentheses.php", contents: pluginMain() }];
  for (let index = 0; index < 11; index += 1) {
    entries.push({ name: `parentheses/file-${index}.txt`, contents: "x" });
  }
  assertRejectsZip(entries, "too_many_files");
}

function testExcessiveUncompressedSizeRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain() },
    { name: "parentheses/large.txt", contents: "x", uncompressedSize: 1024 * 1024 + 1 },
  ], "archive_too_large");
}

function testDangerousExtensionRejected() {
  assertRejectsZip([
    { name: "parentheses/parentheses.php", contents: pluginMain() },
    { name: "parentheses/install.sh", contents: "echo unsafe" },
  ], "dangerous_file_type");
}

function run() {
  const tests = [
    testValidWordPressPluginZipAccepted,
    testNonZipRejected,
    testTraversalRejected,
    testAbsolutePathRejected,
    testMissingPluginHeaderRejected,
    testMissingVersionHeaderRejected,
    testVersionMismatchRejected,
    testSlugMismatchRejected,
    testTooManyFilesRejected,
    testExcessiveUncompressedSizeRejected,
    testDangerousExtensionRejected,
  ];

  for (const test of tests) {
    test();
    console.log(`PASS ${test.name}`);
  }
}

run();
