const crypto = require("crypto");

function masterKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    const error = new Error("APP_ENCRYPTION_KEY must be configured with at least 32 characters before database-managed secrets can be used.");
    error.code = "ENCRYPTION_KEY_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(value) {
  if (value === undefined || value === null || value === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decrypt(payload) {
  if (!payload?.ciphertext) return "";
  if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm") throw new Error("Unsupported encrypted secret format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function fingerprint(value) {
  return value ? crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12) : "";
}

function encryptionStatus() {
  const configured = Boolean(process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.length >= 32);
  return { configured, algorithm: "AES-256-GCM", keySource: "APP_ENCRYPTION_KEY" };
}

module.exports = { decrypt, encrypt, encryptionStatus, fingerprint };
