function boolEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function intEnv(name, defaultValue) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : defaultValue;
}

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  activation: {
    allowLocalhost: boolEnv("LICENSE_ALLOW_LOCALHOST", !isProduction),
    allowPrivateHosts: boolEnv("LICENSE_ALLOW_PRIVATE_HOSTS", !isProduction),
    allowStagingDomains: boolEnv("LICENSE_ALLOW_STAGING_DOMAINS", true),
  },
  expiration: {
    gracePeriodDays: intEnv("LICENSE_GRACE_PERIOD_DAYS", 0),
  },
  downloads: {
    customerTokenTtlMs: intEnv("LICENSE_DOWNLOAD_TOKEN_TTL_MS", 10 * 60 * 1000),
    updaterTokenTtlMs: intEnv("LICENSE_UPDATER_TOKEN_TTL_MS", 10 * 60 * 1000),
  },
  keys: {
    segments: intEnv("LICENSE_KEY_SEGMENTS", 4) || 4,
    segmentLength: intEnv("LICENSE_KEY_SEGMENT_LENGTH", 4) || 4,
    includeChecksum: boolEnv("LICENSE_KEY_CHECKSUM", false),
  },
};
