const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { writeAuditLog } = require("../utils/auditLog");
const apiSecurityConfig = require("../config/apiSecurity");

const SENSITIVE_KEYS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "licensekey",
  "license_key",
  "stripe-signature",
  "x-signature",
  "x-psp-signature",
  "secret",
  "apikey",
  "api_key",
];

function requestContext(req, res, next) {
  const incoming = req.get("x-request-id");
  const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

function wantsJsonBody(req) {
  return ["POST", "PUT", "PATCH"].includes(req.method);
}

function requireJsonContentType(req, res, next) {
  if (!wantsJsonBody(req)) return next();
  const hasBody =
    Number(req.headers["content-length"] || 0) > 0 ||
    Boolean(req.headers["transfer-encoding"]);
  if (!hasBody) return next();
  if (req.is("multipart/form-data")) return next();
  if (req.is("application/json")) return next();
  return res.status(415).json({
    success: false,
    message: "Content-Type must be application/json.",
    requestId: req.id,
  });
}

function sanitizeValue(value, key = "") {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive))) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item));
  if (value && typeof value === "object") return sanitizeObject(value);
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}...`;
  return value;
}

function sanitizeObject(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    output[key] = sanitizeValue(value, key);
  }
  return output;
}

function apiAuditLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    if (!req.originalUrl.startsWith("/api/")) return;
    if (req.originalUrl.startsWith("/api/v1/admin/audit")) return;

    writeAuditLog({
      actor: req.user || null,
      action: "api.request",
      targetType: "",
      targetId: null,
      metadata: {
        requestId: req.id,
        method: req.method,
        endpoint: req.route?.path || req.path,
        originalUrl: req.originalUrl.split("?")[0],
        statusCode: res.statusCode,
        durationMs,
        params: sanitizeObject(req.params),
        query: sanitizeObject(req.query),
      },
      ip: req.ip,
    });
  });

  next();
}

function makeRateLimiter(policyName, options = {}) {
  const policy = apiSecurityConfig.rateLimits[policyName];
  if (!policy) throw new Error(`Unknown rate limit policy: ${policyName}`);

  return rateLimit({
    windowMs: options.windowMs || policy.windowMs,
    max: options.max || policy.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: (req) => ({
      success: false,
      message: "Too many requests. Please slow down.",
      requestId: req.id,
    }),
  });
}

module.exports = {
  requestContext,
  requireJsonContentType,
  apiAuditLogger,
  makeRateLimiter,
  sanitizeObject,
};
