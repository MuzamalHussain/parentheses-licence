const crypto = require("crypto");
const { getStorageAdapter } = require("../storageService");

const backups = new Map();

function secret() {
  return crypto.createHash("sha256").update(process.env.BACKUP_METADATA_SECRET || process.env.JWT_ACCESS_SECRET || "parentheses-backup-metadata").digest();
}

function encryptMetadata(metadata = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(metadata), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64"),
  };
}

function decryptMetadata(encrypted) {
  if (!encrypted?.value) return {};
  const decipher = crypto.createDecipheriv("aes-256-gcm", secret(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted.value, "base64")),
    decipher.final(),
  ]).toString("utf8"));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stable(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function checksumFor(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(manifest))).digest("hex");
}

async function store(manifest, metadata = {}) {
  const checksum = checksumFor(manifest);
  const record = {
    ...manifest,
    checksum,
    metadataEncrypted: encryptMetadata(metadata),
    storage: {
      provider: getStorageAdapter().provider,
      location: `vendor-neutral://${manifest.id}`,
      cloudProviderReady: true,
    },
  };
  backups.set(record.id, record);
  return publicRecord(record);
}

function publicRecord(record) {
  if (!record) return null;
  return {
    ...record,
    metadataEncrypted: undefined,
    metadataPreview: { encrypted: true, algorithm: record.metadataEncrypted?.algorithm || "aes-256-gcm" },
  };
}

function get(id, { includeMetadata = false } = {}) {
  const record = backups.get(id);
  if (!record) return null;
  return includeMetadata ? { ...record, metadata: decryptMetadata(record.metadataEncrypted) } : publicRecord(record);
}

function list() {
  return Array.from(backups.values()).map(publicRecord);
}

function resetForTests() {
  backups.clear();
}

module.exports = { checksumFor, decryptMetadata, encryptMetadata, get, list, resetForTests, store };
