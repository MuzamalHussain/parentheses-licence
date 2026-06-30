const crypto = require("crypto");
const { getConfig } = require("../config/env");

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto
    .createHmac("sha256", getConfig().auth.accessSecret)
    .update(payload)
    .digest("base64url");
}

function createUpdaterToken({ purpose, expiresAt }) {
  const payload = base64url(JSON.stringify({
    nonce: crypto.randomBytes(24).toString("hex"),
    purpose,
    exp: Math.floor(expiresAt.getTime() / 1000),
  }));
  return `${payload}.${sign(payload)}`;
}

function verifyUpdaterToken(token, expectedPurpose) {
  if (!token || typeof token !== "string" || token.includes("/") || token.includes("\\")) {
    return { valid: false, reason: "invalid_format" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "invalid_format" };

  const [payload, signature] = parts;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }

  if (data.purpose !== expectedPurpose) return { valid: false, reason: "wrong_purpose" };
  if (!data.exp || Date.now() > data.exp * 1000) return { valid: false, reason: "expired" };

  return { valid: true, data };
}

module.exports = { createUpdaterToken, verifyUpdaterToken };
