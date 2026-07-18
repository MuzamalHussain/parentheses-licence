const assert = require("assert");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost:27017/test";
process.env.JWT_ACCESS_SECRET = "smtp-runtime-access-secret";
process.env.JWT_REFRESH_SECRET = "smtp-runtime-refresh-secret";
process.env.EMAIL_ENABLED = "true";
process.env.EMAIL_PROVIDER = "smtp";
process.env.SMTP_HOST = "smtp.gmail.com";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_REQUIRE_TLS = "true";
process.env.SMTP_USER = "mailer@example.test";
process.env.SMTP_PASS = "abcd efgh ijkl mnop";
process.env.SMTP_FROM = "Mailer <mailer@example.test>";
process.env.EMAIL_TIMEOUT_MS = "15000";

const { getConfig } = require("../src/config/env");
const { parseBoolean, normalizeGmailAppPassword, validateResolvedEmail } = require("../src/services/notifications/EmailConfigResolver");
const { createSmtpProvider, buildTransportOptions } = require("../src/services/notifications/providers/smtpProvider");

async function run() {
  const config = getConfig();
  assert.strictEqual(config.email.enabled, true);
  assert.strictEqual(config.email.secure, false);
  assert.strictEqual(config.email.requireTLS, true);
  assert.strictEqual(config.email.port, 587);
  assert.strictEqual(config.email.pass, process.env.SMTP_PASS);
  assert.strictEqual(config.email.timeoutMs, 15000);
  assert.strictEqual(parseBoolean("false", true), false);
  assert.strictEqual(parseBoolean("true", false), true);
  assert.strictEqual(normalizeGmailAppPassword("smtp.gmail.com", process.env.SMTP_PASS), "abcdefghijklmnop");

  const options = buildTransportOptions(config);
  assert.deepStrictEqual({ port: options.port, secure: options.secure, requireTLS: options.requireTLS }, { port: 587, secure: false, requireTLS: true });
  assert.strictEqual(options.auth.pass, process.env.SMTP_PASS);
  assert.strictEqual(options.connectionTimeout, 15000);
  assert.strictEqual(options.greetingTimeout, 15000);
  assert.strictEqual(options.socketTimeout, 15000);

  let captured;
  const successProvider = createSmtpProvider(config, { createTransport(value) { captured = value; return { verify: async () => true, close() {} }; } });
  assert.deepStrictEqual(await successProvider.verify(), { success: true, provider: "smtp" });
  assert.strictEqual(captured.auth.user, process.env.SMTP_USER);

  const authError = Object.assign(new Error("authentication failed"), { code: "EAUTH", command: "AUTH" });
  const failureProvider = createSmtpProvider(config, { createTransport() { return { verify: async () => { throw authError; }, close() {} }; } });
  await assert.rejects(failureProvider.verify(), (error) => error.code === "EAUTH");

  const timeoutError = Object.assign(new Error("connection timeout"), { code: "ETIMEDOUT" });
  const timeoutProvider = createSmtpProvider(config, { createTransport() { return { verify: async () => { throw timeoutError; }, close() {} }; } });
  await assert.rejects(timeoutProvider.verify(), (error) => error.code === "ETIMEDOUT");

  assert.throws(() => validateResolvedEmail({ enabled: true, host: "bad", port: 587 }, "database"), (error) => error.code === "EMAIL_CONFIG_INVALID" && error.source === "database");
  console.log("SMTP runtime configuration tests passed.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
