const crypto = require("crypto");

// Characters: uppercase alphanumeric, excluding ambiguous chars (0, O, I, 1)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a license key in format: XXXX-XXXX-XXXX-XXXX
 * Uses crypto.randomBytes for cryptographic randomness.
 */
function generateLicenseKey() {
  const segments = 4;
  const segmentLength = 4;
  const parts = [];

  for (let s = 0; s < segments; s++) {
    let segment = "";
    // Need segmentLength random chars; use 2 bytes per char for good distribution
    const bytes = crypto.randomBytes(segmentLength * 2);
    for (let i = 0; i < segmentLength; i++) {
      const val = bytes.readUInt16BE(i * 2);
      segment += CHARS[val % CHARS.length];
    }
    parts.push(segment);
  }

  return parts.join("-");
}

/**
 * Generates a unique key, retrying up to maxAttempts if a collision is found.
 * Pass the License model to check for uniqueness.
 */
async function generateUniqueLicenseKey(LicenseModel, maxAttempts = 10, options = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateLicenseKey();
    const query = LicenseModel.exists({ licenseKey: key });
    const exists = options.session ? await query.session(options.session) : await query;
    if (!exists) return key;
  }
  throw new Error("Failed to generate a unique license key after max attempts.");
}

module.exports = { generateLicenseKey, generateUniqueLicenseKey };
