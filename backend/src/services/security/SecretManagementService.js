const crypto = require("crypto");
const { getConfig } = require("../../config/env");

function hashConfigured(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function secretHealth() {
  const config = getConfig();
  const secrets = [
    { id: "jwt_access", name: "JWT Access Secret", configured: Boolean(config.auth.accessSecret), minLength: 32, actualLength: config.auth.accessSecret?.length || 0 },
    { id: "jwt_refresh", name: "JWT Refresh Secret", configured: Boolean(config.auth.refreshSecret), minLength: 32, actualLength: config.auth.refreshSecret?.length || 0 },
    { id: "database", name: "Database Credentials", configured: Boolean(config.database.uri), minLength: 1, actualLength: config.database.uri?.length || 0 },
    { id: "smtp", name: "SMTP Credentials", configured: Boolean(config.email.pass), minLength: 1, actualLength: config.email.pass?.length || 0 },
    { id: "stripe", name: "Payment Provider Key", configured: Boolean(config.payments.stripeSecretKey), minLength: 1, actualLength: config.payments.stripeSecretKey?.length || 0 },
    { id: "storage", name: "Storage Credentials", configured: Boolean(config.storage.provider), minLength: 1, actualLength: config.storage.provider?.length || 0 },
    { id: "ai", name: "AI Provider Keys", configured: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY), minLength: 1, actualLength: 1 },
  ];
  return secrets.map((secret) => ({
    id: secret.id,
    name: secret.name,
    configured: secret.configured,
    status: secret.configured && secret.actualLength >= secret.minLength ? "healthy" : "review",
    fingerprint: hashConfigured(secret.configured ? `${secret.id}:${secret.actualLength}` : ""),
    value: "[REDACTED]",
    externalSecretManagerReady: true,
  }));
}

function summary() {
  const secrets = secretHealth();
  return {
    total: secrets.length,
    healthy: secrets.filter((secret) => secret.status === "healthy").length,
    review: secrets.filter((secret) => secret.status !== "healthy").length,
    secrets,
  };
}

module.exports = { secretHealth, summary };
