const crypto = require("crypto");
const licenseEngineConfig = require("../config/licenseEngine");

// Characters: uppercase alphanumeric, excluding ambiguous chars (0, O, I, 1)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function checksumFor(value) {
  const digest = crypto.createHash("sha256").update(value).digest();
  return CHARS[digest[0] % CHARS.length] + CHARS[digest[1] % CHARS.length];
}

/**
 * Generates a license key in format: XXXX-XXXX-XXXX-XXXX by default.
 * Uses crypto.randomBytes for cryptographic randomness.
 */
function generateLicenseKey(options = {}) {
  const segments = options.segments || licenseEngineConfig.keys.segments;
  const segmentLength = options.segmentLength || licenseEngineConfig.keys.segmentLength;
  const includeChecksum = options.includeChecksum ?? licenseEngineConfig.keys.includeChecksum;
  const parts = [];

  for (let s = 0; s < segments; s++) {
    let segment = "";
    for (let i = 0; i < segmentLength; i++) {
      segment += CHARS[crypto.randomInt(0, CHARS.length)];
    }
    parts.push(segment);
  }

  if (includeChecksum) parts.push(checksumFor(parts.join("")));

  return parts.join("-");
}

/**
 * Generates a unique key, retrying up to maxAttempts if a collision is found.
 * Pass the License model to check for uniqueness.
 */
async function generateUniqueLicenseKey(LicenseModel, maxAttempts = 10, options = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateLicenseKey(options);
    const query = LicenseModel.exists({ licenseKey: key });
    const exists = options.session ? await query.session(options.session) : await query;
    if (!exists) return key;
  }
  throw new Error("Failed to generate a unique license key after max attempts.");
}

function maskLicenseKey(licenseKey = "") {
  const compact = String(licenseKey).replace(/-/g, "");
  if (compact.length <= 8) return "****";
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

module.exports = { generateLicenseKey, generateUniqueLicenseKey, maskLicenseKey };
