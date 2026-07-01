const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65557;
const HEADER_SCAN_BYTES = 8192;
const JUNK_TOP_LEVEL = new Set(["__MACOSX", ".DS_Store"]);
const DANGEROUS_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".so",
]);

class ZipValidationError extends Error {
  constructor(code, message, statusCode = 422, metadata = {}) {
    super(message);
    this.name = "ZipValidationError";
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

function fail(code, message, metadata) {
  throw new ZipValidationError(code, message, 422, metadata);
}

function normalizeEntryName(name) {
  return String(name || "").replace(/\\/g, "/");
}

function isAbsoluteEntry(name) {
  return name.startsWith("/") || name.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(name);
}

function isJunkEntry(entryName) {
  const parts = normalizeEntryName(entryName).split("/").filter(Boolean);
  if (!parts.length) return true;
  return JUNK_TOP_LEVEL.has(parts[0]);
}

function findEndOfCentralDirectory(buffer) {
  const searchStart = Math.max(0, buffer.length - MAX_EOCD_SEARCH);
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function parseCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) fail("invalid_zip", "Invalid ZIP archive.");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    fail("invalid_zip", "Invalid ZIP archive.");
  }

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      fail("invalid_zip", "Invalid ZIP archive.");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.length) fail("invalid_zip", "Invalid ZIP archive.");

    const rawName = buffer.slice(nameStart, nameEnd).toString(flags & 0x800 ? "utf8" : "latin1");
    entries.push({
      rawName,
      name: normalizeEntryName(rawName),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      externalAttributes,
      localHeaderOffset,
      isDirectory: rawName.endsWith("/") || rawName.endsWith("\\"),
    });

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function isSymlink(entry) {
  const unixMode = entry.externalAttributes >>> 16;
  return (unixMode & 0o170000) === 0o120000;
}

function readEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    fail("invalid_zip", "Invalid ZIP archive.");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) fail("invalid_zip", "Invalid ZIP archive.");

  const compressed = buffer.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
  fail("unsupported_compression", "Unsupported ZIP compression method.");
}

function parsePluginHeaders(contents) {
  const header = contents.slice(0, HEADER_SCAN_BYTES).toString("utf8");
  const pluginName = header.match(/^[ \t/*#@]*Plugin Name:\s*(.+)$/im)?.[1]?.trim();
  const version = header.match(/^[ \t/*#@]*Version:\s*(.+)$/im)?.[1]?.trim();
  return { pluginName, version };
}

function validateEntryNames(entries, limits) {
  const usableEntries = [];
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (!entry.name || entry.name.includes("\0")) {
      fail("unsafe_path", "ZIP contains an unsafe path.");
    }
    if (isAbsoluteEntry(entry.rawName) || isAbsoluteEntry(entry.name)) {
      fail("absolute_path", "ZIP contains an absolute path.");
    }

    const parts = entry.name.split("/").filter(Boolean);
    if (parts.includes("..") || path.posix.normalize(entry.name).startsWith("../")) {
      fail("path_traversal", "ZIP contains an unsafe path.");
    }
    if (isJunkEntry(entry.name)) continue;

    if (isSymlink(entry)) fail("symlink_entry", "ZIP contains an unsupported file type.");

    usableEntries.push(entry);
    if (!entry.isDirectory) {
      totalUncompressedBytes += entry.uncompressedSize;
      const extension = path.posix.extname(entry.name).toLowerCase();
      if (DANGEROUS_EXTENSIONS.has(extension)) {
        fail("dangerous_file_type", "ZIP contains an unsupported file type.");
      }
      if (extension === ".zip") {
        fail("nested_archive", "ZIP contains a nested archive.");
      }
    }
  }

  const fileCount = usableEntries.filter((entry) => !entry.isDirectory).length;
  if (!usableEntries.length) fail("invalid_structure", "ZIP must contain one plugin folder.");
  if (fileCount > limits.maxFiles) fail("too_many_files", "ZIP contains too many files.", { fileCount });
  if (totalUncompressedBytes > limits.maxUncompressedBytes) {
    fail("archive_too_large", "ZIP uncompressed contents are too large.", { totalUncompressedBytes });
  }

  return { usableEntries, fileCount, totalUncompressedBytes };
}

function validatePluginStructure({ buffer, usableEntries, expectedSlug, expectedVersion, limits }) {
  const topLevelFolders = new Set();

  for (const entry of usableEntries) {
    const parts = entry.name.split("/").filter(Boolean);
    if (parts.length) topLevelFolders.add(parts[0]);
  }

  if (topLevelFolders.size !== 1) fail("invalid_structure", "ZIP must contain exactly one plugin folder.");

  const rootFolder = [...topLevelFolders][0];
  if (expectedSlug && rootFolder !== expectedSlug) {
    fail("slug_mismatch", "Plugin folder does not match this product slug.", { rootFolder });
  }

  const files = usableEntries.filter((entry) => !entry.isDirectory);
  if (files.some((entry) => !entry.name.startsWith(`${rootFolder}/`))) {
    fail("outside_plugin_root", "ZIP contains files outside the plugin folder.");
  }

  const mainCandidates = files.filter((entry) => {
    const parts = entry.name.split("/").filter(Boolean);
    return parts.length === 2 && path.posix.extname(entry.name).toLowerCase() === ".php";
  });

  for (const candidate of mainCandidates) {
    const contents = readEntry(buffer, candidate);
    const headers = parsePluginHeaders(contents);
    if (!headers.pluginName) continue;
    if (!headers.version) fail("missing_version_header", "WordPress plugin Version header is missing.");
    if (expectedVersion && headers.version !== expectedVersion) {
      fail("version_mismatch", "Plugin header version does not match the uploaded version.");
    }
    return { rootFolder, mainPluginFile: candidate.name, pluginName: headers.pluginName, version: headers.version };
  }

  fail("missing_plugin_header", "WordPress plugin header is missing.");
}

function validatePluginZip(filePath, options = {}) {
  const {
    expectedSlug = "",
    expectedVersion = "",
    maxFiles = 2000,
    maxUncompressedBytes = 150 * 1024 * 1024,
    maxCompressionRatio = 20,
  } = options;

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    fail("invalid_zip", "Invalid ZIP archive.");
  }

  if (buffer.length < 22 || buffer.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) {
    fail("invalid_zip", "Invalid ZIP archive.");
  }

  const entries = parseCentralDirectory(buffer);
  const { usableEntries, fileCount, totalUncompressedBytes } = validateEntryNames(entries, {
    maxFiles,
    maxUncompressedBytes,
  });

  const ratio = buffer.length > 0 ? totalUncompressedBytes / buffer.length : Infinity;
  if (ratio > maxCompressionRatio) {
    fail("compression_ratio_exceeded", "ZIP compression ratio is too high.", { ratio });
  }

  const plugin = validatePluginStructure({
    buffer,
    usableEntries,
    expectedSlug,
    expectedVersion,
    limits: { maxFiles, maxUncompressedBytes, maxCompressionRatio },
  });

  return {
    valid: true,
    fileCount,
    totalUncompressedBytes,
    compressionRatio: ratio,
    ...plugin,
  };
}

module.exports = {
  ZipValidationError,
  validatePluginZip,
};
