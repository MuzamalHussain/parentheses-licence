function intEnv(name, defaultValue) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function stringEnv(name, defaultValue) {
  const value = process.env[name];
  return value === undefined || value === "" ? defaultValue : value;
}

module.exports = {
  body: {
    jsonLimit: stringEnv("API_JSON_BODY_LIMIT", "1mb"),
    webhookLimit: stringEnv("API_WEBHOOK_BODY_LIMIT", "256kb"),
    urlencodedLimit: stringEnv("API_URLENCODED_BODY_LIMIT", "256kb"),
  },
  rateLimits: {
    global: {
      windowMs: intEnv("API_RATE_GLOBAL_WINDOW_MS", 15 * 60 * 1000),
      max: intEnv("API_RATE_GLOBAL_MAX", 300),
    },
    auth: {
      windowMs: intEnv("API_RATE_AUTH_WINDOW_MS", 15 * 60 * 1000),
      max: intEnv("API_RATE_AUTH_MAX", 10),
    },
    downloads: {
      windowMs: intEnv("API_RATE_DOWNLOAD_WINDOW_MS", 60 * 1000),
      max: intEnv("API_RATE_DOWNLOAD_MAX", 30),
    },
    webhooks: {
      windowMs: intEnv("API_RATE_WEBHOOK_WINDOW_MS", 60 * 1000),
      max: intEnv("API_RATE_WEBHOOK_MAX", 120),
    },
    admin: {
      windowMs: intEnv("API_RATE_ADMIN_WINDOW_MS", 60 * 1000),
      max: intEnv("API_RATE_ADMIN_MAX", 180),
    },
  },
  webhooks: {
    timestampToleranceSeconds: intEnv("WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS", 300),
  },
};
