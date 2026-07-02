const SENSITIVE_KEYS = [
  "password",
  "pass",
  "token",
  "authorization",
  "cookie",
  "licensekey",
  "license_key",
  "apikey",
  "api_key",
  "secret",
  "signature",
  "stripe",
  "payment",
];

function shouldRedact(key = "") {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

function sanitizeLogData(value, key = "") {
  if (shouldRedact(key)) return "[REDACTED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeLogData(item));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = sanitizeLogData(childValue, childKey);
    }
    return output;
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}...`;
  return value;
}

function write(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogData(data),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function logInfo(event, data) {
  write("info", event, data);
}

function logWarn(event, data) {
  write("warn", event, data);
}

function logError(event, data) {
  write("error", event, data);
}

function createLogger(defaults = {}) {
  return {
    info(event, data = {}) {
      logInfo(event, { ...defaults, ...data });
    },
    warn(event, data = {}) {
      logWarn(event, { ...defaults, ...data });
    },
    error(event, data = {}) {
      logError(event, { ...defaults, ...data });
    },
  };
}

module.exports = {
  createLogger,
  logInfo,
  logWarn,
  logError,
  sanitizeLogData,
};
