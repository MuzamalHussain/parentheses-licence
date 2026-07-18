const Integration = require("../../models/Integration");
const mongoose = require("mongoose");
const IntegrationManager = require("../integrations/IntegrationManager");
const { logInfo } = require("../../utils/logger");

let lastLoggedFingerprint = "";

function maskAddress(value = "") {
  const match = String(value).match(/<?([^\s<>]+)@([^\s<>]+)>?/);
  if (!match) return value ? "configured" : "";
  return `${match[1].slice(0, 2)}***@${match[2]}`;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw Object.assign(new Error(`Invalid boolean email setting: ${value}`), { code: "EMAIL_CONFIG_INVALID" });
}

function normalizeGmailAppPassword(host, password) {
  const raw = String(password || "").trim();
  if (!/(^|\.)gmail\.com$/i.test(String(host || ""))) return raw;
  const compact = raw.replace(/\s+/g, "");
  return /^[A-Za-z0-9]{16}$/.test(compact) ? compact : raw;
}

function fromAddress(configuration, fallback) {
  if (!configuration.fromEmail) return fallback;
  return configuration.fromName
    ? `${configuration.fromName} <${configuration.fromEmail}>`
    : configuration.fromEmail;
}

function validateResolvedEmail(email, source) {
  if (!email.enabled) return;
  const missing = ["host", "port", "user", "pass", "from"].filter((key) => !email[key]);
  if (missing.length) {
    throw Object.assign(new Error(`Invalid ${source} SMTP configuration; missing: ${missing.join(", ")}`), {
      code: "EMAIL_CONFIG_INVALID",
      source,
    });
  }
}

async function resolveEmailConfig(baseConfig) {
  const record = mongoose.connection.readyState === 1
    ? await Integration.findOne({ providerId: "smtp" }).select("enabled configuration encryptedSecrets").lean()
    : null;
  let email = { ...baseConfig.email, source: "env" };

  if (record?.enabled) {
    const db = await IntegrationManager.resolveConfiguration("smtp");
    const encryption = String(db.encryption || "").toLowerCase();
    email = {
      ...email,
      source: "database",
      enabled: true,
      host: db.host ?? email.host,
      port: db.port === undefined ? email.port : Number(db.port),
      secure: encryption ? encryption === "tls" : parseBoolean(db.secure, email.secure),
      requireTLS: encryption ? encryption === "starttls" : parseBoolean(db.requireTLS, email.requireTLS),
      user: db.username ?? email.user,
      pass: db.password ?? email.pass,
      from: fromAddress(db, email.from),
      replyTo: db.replyTo ?? email.replyTo,
      timeoutMs: db.timeoutMs === undefined ? email.timeoutMs : Number(db.timeoutMs),
    };
  }

  email.port = Number(email.port);
  email.timeoutMs = Number(email.timeoutMs) || 10000;
  email.pass = normalizeGmailAppPassword(email.host, email.pass);
  validateResolvedEmail(email, email.source);
  const diagnostic = {
    source: email.source,
    enabled: email.enabled,
    provider: email.provider,
    host: email.host || "",
    port: email.port,
    secure: email.secure,
    requireTLS: email.requireTLS,
    username: maskAddress(email.user),
    from: maskAddress(email.from),
    timeout: email.timeoutMs,
    passwordConfigured: Boolean(email.pass),
  };
  const fingerprint = JSON.stringify(diagnostic);
  if (fingerprint !== lastLoggedFingerprint) {
    logInfo("email.smtp_config_resolved", diagnostic);
    lastLoggedFingerprint = fingerprint;
  }
  return { ...baseConfig, email };
}

module.exports = { resolveEmailConfig, parseBoolean, normalizeGmailAppPassword, validateResolvedEmail, maskAddress };
