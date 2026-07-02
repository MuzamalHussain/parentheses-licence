const { getConfig } = require("../config/env");
const { renderTemplate } = require("./notifications/templates");
const { createEmailProvider } = require("./notifications/providers");
const { getNotificationQueue } = require("./notifications/queue");
const { logInfo, logWarn } = require("../utils/logger");

let providerOverride = null;
let loggerOverride = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskRecipient(recipient = "") {
  const [local, domain] = String(recipient).split("@");
  if (!domain) return recipient;
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? "***" : "*"}@${domain}`;
}

function getLogger() {
  return loggerOverride || {
    log: (marker, payload) => logInfo("notification.sent", { marker, ...payload }),
    warn: (marker, payload) => logWarn("notification.warning", { marker, ...payload }),
  };
}

function getProvider(config = getConfig()) {
  return providerOverride || createEmailProvider(config);
}

function logNotification({ type, provider, status, durationMs, recipient, error, attempt }) {
  const logger = getLogger();
  const payload = {
    type,
    provider,
    status,
    durationMs,
    recipient: maskRecipient(recipient),
    attempt,
    ...(error ? { error: error.message } : {}),
  };

  if (status === "sent") logger.log("[Notification]", payload);
  else logger.warn("[Notification]", payload);
}

async function sendWithRetry({ provider, message, type, retryCount }) {
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    try {
      const info = await provider.send(message);
      logNotification({
        type,
        provider: provider.name,
        status: "sent",
        durationMs: Date.now() - startedAt,
        recipient: message.to,
        attempt,
      });
      return { success: true, provider: provider.name, messageId: info?.messageId || "", attempts: attempt };
    } catch (err) {
      lastError = err;
      logNotification({
        type,
        provider: provider.name,
        status: attempt <= retryCount ? "retrying" : "failed",
        durationMs: Date.now() - startedAt,
        recipient: message.to,
        error: err,
        attempt,
      });
      if (attempt <= retryCount) await wait(Math.min(250 * attempt, 1000));
    }
  }

  return { success: false, provider: provider.name, error: lastError?.message || "Notification failed", attempts: retryCount + 1 };
}

async function notify(type, { to, payload = {}, subject, html, metadata = {}, queue = true } = {}) {
  const config = getConfig();
  if (!config.email.enabled) {
    logNotification({
      type,
      provider: config.email.provider,
      status: "skipped",
      durationMs: 0,
      recipient: to,
      error: new Error("Email is not configured"),
      attempt: 0,
    });
    return { success: false, skipped: true, reason: "email_not_configured" };
  }

  const rendered = subject && html ? { subject, html } : renderTemplate(type, payload);
  const message = {
    from: config.email.from,
    to,
    subject: rendered.subject,
    html: rendered.html,
    ...(config.email.replyTo ? { replyTo: config.email.replyTo } : {}),
  };

  const provider = getProvider(config);
  const job = () => sendWithRetry({
    provider,
    message,
    type,
    retryCount: config.email.retryCount,
    metadata,
  });

  return queue ? getNotificationQueue().enqueue(job) : job();
}

async function sendVerificationEmail({ to, name, url }) {
  return notify("verifyEmail", { to, payload: { name, url } });
}

async function sendPasswordResetEmail({ to, name, url }) {
  return notify("passwordReset", { to, payload: { name, url } });
}

async function sendWelcomeEmail({ to, name }) {
  return notify("welcome", { to, payload: { name } });
}

async function sendLicensePurchasedEmail({ to, name, productName, licenseKey }) {
  return notify("licensePurchased", { to, payload: { name, productName, licenseKey } });
}

async function verifyEmailProvider() {
  const config = getConfig();
  const provider = getProvider(config);
  const startedAt = Date.now();
  try {
    const result = await provider.verify();
    return { ...result, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { success: false, provider: provider.name, error: err.message, durationMs: Date.now() - startedAt };
  }
}

async function sendTestEmail(to) {
  return notify("adminAlert", {
    to,
    payload: {
      title: "Notification test",
      message: "This is a test notification from Parentheses.",
    },
  });
}

function setNotificationProviderForTests(provider) {
  providerOverride = provider;
}

function setNotificationLoggerForTests(logger) {
  loggerOverride = logger;
}

function resetNotificationServiceForTests() {
  providerOverride = null;
  loggerOverride = null;
}

module.exports = {
  notify,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLicensePurchasedEmail,
  verifyEmailProvider,
  sendTestEmail,
  setNotificationProviderForTests,
  setNotificationLoggerForTests,
  resetNotificationServiceForTests,
};
