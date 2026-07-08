const crypto = require("crypto");
const ApiKey = require("../../models/ApiKey");
const { writeAuditLog } = require("../../utils/auditLog");

const DEFAULT_SCOPES = ["products.read"];
const READ_SCOPES = ["products.read", "licenses.read", "orders.read", "downloads.read", "customers.read", "analytics.read"];
const WRITE_SCOPES = ["products.write", "licenses.write", "orders.write", "webhooks.write"];

function hashKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest("hex");
}

function prefixFor({ environment, keyType }) {
  if (keyType === "temporary") return "pl_tmp";
  return environment === "sandbox" ? "pl_test" : "pl_live";
}

function generateRawKey({ environment = "production", keyType = "production" } = {}) {
  return `${prefixFor({ environment, keyType })}_${crypto.randomBytes(32).toString("base64url")}`;
}

function normalizeScopes(scopes = DEFAULT_SCOPES, accessType = "read_only") {
  const allowed = accessType === "read_only" ? READ_SCOPES : [...READ_SCOPES, ...WRITE_SCOPES, "admin"];
  return [...new Set(scopes.filter((scope) => allowed.includes(scope)))];
}

async function audit({ actor, action, targetId = null, metadata = {}, ip = "", requestId = "" }) {
  await writeAuditLog({ actor, action, targetType: "ApiKey", targetId, metadata, ip, requestId });
}

async function createKey({ name, description = "", ownerId, environment = "production", accessType = "read_only", keyType = null, scopes = DEFAULT_SCOPES, expiresAt = null, actor = null, ip = "", requestId = "" }) {
  const effectiveType = keyType || (environment === "sandbox" ? "sandbox" : "production");
  const rawKey = generateRawKey({ environment, keyType: effectiveType });
  const doc = await ApiKey.create({
    name,
    description,
    ownerId,
    keyHash: hashKey(rawKey),
    keyPrefix: rawKey.split("_").slice(0, 2).join("_"),
    keyLast4: rawKey.slice(-4),
    environment,
    accessType,
    keyType: effectiveType,
    scopes: normalizeScopes(scopes, accessType),
    expiresAt,
  });
  await audit({ actor, action: "api_key.created", targetId: doc._id, metadata: { environment, accessType, scopes: doc.scopes }, ip, requestId });
  return { apiKey: doc, rawKey };
}

async function listKeys(filter = {}) {
  return ApiKey.find(filter).select("-keyHash").sort({ createdAt: -1 }).lean();
}

async function rotateKey(id, { actor = null, ip = "", requestId = "" } = {}) {
  const existing = await ApiKey.findById(id).select("+keyHash");
  if (!existing) return null;
  existing.status = "revoked";
  existing.revokedAt = new Date();
  existing.revokedBy = actor?._id || null;
  await existing.save();
  const rotated = await createKey({
    name: `${existing.name} (rotated)`,
    description: existing.description,
    ownerId: existing.ownerId,
    environment: existing.environment,
    accessType: existing.accessType,
    keyType: existing.keyType,
    scopes: existing.scopes,
    expiresAt: existing.expiresAt,
    actor,
    ip,
    requestId,
  });
  rotated.apiKey.rotatedFrom = existing._id;
  await rotated.apiKey.save();
  await audit({ actor, action: "api_key.rotated", targetId: existing._id, metadata: { newKeyId: rotated.apiKey._id }, ip, requestId });
  return rotated;
}

async function revokeKey(id, { actor = null, ip = "", requestId = "" } = {}) {
  const key = await ApiKey.findByIdAndUpdate(
    id,
    { status: "revoked", revokedAt: new Date(), revokedBy: actor?._id || null },
    { new: true }
  ).select("-keyHash");
  if (key) await audit({ actor, action: "api_key.revoked", targetId: key._id, ip, requestId });
  return key;
}

async function authenticate(rawKey, { ip = "" } = {}) {
  const keyHash = hashKey(rawKey);
  const apiKey = await ApiKey.findOne({ keyHash }).select("+keyHash");
  if (!apiKey) return { ok: false, code: "API_KEY_INVALID", message: "Invalid API key." };
  if (apiKey.status === "revoked") return { ok: false, code: "API_KEY_REVOKED", message: "API key has been revoked." };
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    apiKey.status = "expired";
    await apiKey.save();
    return { ok: false, code: "API_KEY_EXPIRED", message: "API key has expired." };
  }
  apiKey.lastUsedAt = new Date();
  apiKey.lastUsedIp = ip;
  apiKey.usageCount = (apiKey.usageCount || 0) + 1;
  await apiKey.save();
  return { ok: true, apiKey };
}

module.exports = {
  DEFAULT_SCOPES,
  READ_SCOPES,
  WRITE_SCOPES,
  hashKey,
  generateRawKey,
  normalizeScopes,
  createKey,
  listKeys,
  rotateKey,
  revokeKey,
  authenticate,
};
