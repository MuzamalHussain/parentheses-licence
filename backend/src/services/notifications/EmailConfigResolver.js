const settings = require("../settings");
const { logInfo } = require("../../utils/logger");
let fingerprint = "";
const mask = (value = "") => { const [a, b] = String(value).replace(/[<>]/g, "").split("@"); return b ? `${a.slice(0, 2)}***@${b}` : value ? "configured" : ""; };
function normalizeGmailAppPassword(host, password) { const raw = String(password || "").trim(); const compact = raw.replace(/\s+/g, ""); return /(^|\.)gmail\.com$/i.test(String(host || "")) && /^[A-Za-z0-9]{16}$/.test(compact) ? compact : raw; }
async function resolveEmailConfig(baseConfig) {
  const values = await settings.getGroup("email");
  const enabledSetting = await settings.get("email.enabled", { withMetadata: true });
  const email = { ...baseConfig.email, source: "runtime-settings", enabled: enabledSetting.source === "default" ? baseConfig.email.enabled : values["email.enabled"], provider: values["email.provider"], host: values["email.smtp.host"], port: values["email.smtp.port"], secure: values["email.smtp.secure"], requireTLS: values["email.smtp.requireTLS"], user: values["email.smtp.username"], pass: normalizeGmailAppPassword(values["email.smtp.host"], values["email.smtp.password"]), from: `${values["email.fromName"]} <${values["email.fromEmail"]}>`, replyTo: values["email.replyTo"], retryCount: values["email.retryCount"], timeoutMs: values["email.socketTimeout"], connectionTimeout: values["email.connectionTimeout"], greetingTimeout: values["email.greetingTimeout"], socketTimeout: values["email.socketTimeout"], rateLimit: values["email.rateLimit"], maximumDaily: values["email.maximumDaily"], encoding: values["email.encoding"] };
  const safe = { source: email.source, enabled: email.enabled, provider: email.provider, host: email.host, port: email.port, secure: email.secure, requireTLS: email.requireTLS, username: mask(email.user), from: mask(values["email.fromEmail"]), passwordConfigured: Boolean(email.pass) };
  const next = JSON.stringify(safe); if (next !== fingerprint) { logInfo("email.smtp_config_resolved", safe); fingerprint = next; }
  return { ...baseConfig, email };
}
module.exports = { resolveEmailConfig, normalizeGmailAppPassword, maskAddress: mask };
