const crypto = require("crypto");

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function generateSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

function canonicalBody(envelope) {
  return JSON.stringify(envelope || {});
}

function signEnvelope(secret, envelope, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${canonicalBody(envelope)}`;
  const digest = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return {
    timestamp: String(timestamp),
    signature: `t=${timestamp},v1=${digest}`,
    digest,
  };
}

function verifySignature({ secret, envelope, timestamp, signature, toleranceSeconds = 300 }) {
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp || 0));
  if (!timestamp || age > toleranceSeconds) return false;
  const expected = signEnvelope(secret, envelope, timestamp).signature;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || "")));
}

module.exports = { hashSecret, generateSecret, signEnvelope, verifySignature };
