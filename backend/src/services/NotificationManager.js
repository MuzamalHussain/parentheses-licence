const { getConfig } = require("../config/env");
const { createNotificationRegistry } = require("./notifications/NotificationRegistry");
const TemplateService = require("./notifications/NotificationTemplateService");
const PreferenceService = require("./notifications/NotificationPreferenceService");
const { writeAuditLog } = require("../utils/auditLog");
const { logInfo, logWarn } = require("../utils/logger");

let providerOverride = null;
let loggerOverride = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Email send timed out after ${timeoutMs}ms`);
      error.code = "EMAIL_SEND_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

async function audit(action, { actor = null, type, channel, provider, recipient, metadata = {}, error = null }) {
  await writeAuditLog({
    actor,
    action,
    targetType: "Notification",
    metadata: {
      type,
      channel,
      provider,
      recipient: recipient ? maskRecipient(recipient) : "",
      ...(error ? { error: error.message || String(error) } : {}),
      ...metadata,
    },
  }).catch(() => {});
}

function emailEnabled(config) {
  return Boolean(config.email.enabled);
}

async function sendWithRetry({ provider, message, type, retryCount, timeoutMs, metadata, actor }) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastError;
  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      const info = await withTimeout(provider.send(message), remainingMs);
      logNotification({ type, provider: provider.name, status: "sent", durationMs: Date.now() - startedAt, recipient: message.to, attempt });
      await audit("notification.sent", { actor, type, channel: provider.channel, provider: provider.name, recipient: message.to, metadata });
      return { success: true, provider: provider.name, messageId: info?.messageId || info?.notificationId || "", attempts: attempt };
    } catch (err) {
      lastError = err;
      const retrying = attempt <= retryCount && Date.now() < deadline;
      logNotification({ type, provider: provider.name, status: retrying ? "retrying" : "failed", durationMs: Date.now() - startedAt, recipient: message.to, error: err, attempt });
      await audit(retrying ? "notification.retried" : "notification.failed", { actor, type, channel: provider.channel, provider: provider.name, recipient: message.to, metadata, error: err });
      if (retrying) await wait(Math.min(250 * attempt, 1000, Math.max(0, deadline - Date.now())));
      else break;
    }
  }
  return {
    success: false,
    provider: provider.name,
    error: lastError?.message || "Notification failed",
    errorCode: lastError?.code || "EMAIL_SEND_FAILED",
    attempts: retryCount + 1,
  };
}

async function notify(type, options = {}) {
  const {
    to,
    userId,
    payload = {},
    subject,
    html,
    text,
    metadata = {},
    queue = true,
    channels = ["email"],
    actor = null,
  } = options;
  const config = getConfig();
  const registry = createNotificationRegistry(config, providerOverride);
  const results = [];

  for (const channel of channels) {
    const provider = registry.get(channel);
    if (!provider) {
      results.push({ success: false, skipped: true, reason: "provider_not_registered", channel });
      continue;
    }
    if (!(await PreferenceService.isAllowed(userId, type))) {
      results.push({ success: false, skipped: true, reason: "preference_disabled", channel });
      continue;
    }
    if (channel === "email" && !emailEnabled(config)) {
      logNotification({ type, provider: config.email.provider, status: "skipped", durationMs: 0, recipient: to, error: new Error("Email is not configured"), attempt: 0 });
      results.push({ success: false, skipped: true, reason: "email_not_configured", channel });
      continue;
    }

    const rendered = subject && html ? { subject: TemplateService.sanitizeHeader(subject), html, text: text || "" } : await TemplateService.renderTemplate(type, payload, { channel });
    const message = channel === "email"
      ? {
          from: config.email.from,
          to,
          subject: TemplateService.sanitizeHeader(rendered.subject),
          html: rendered.html,
          text: rendered.text,
          ...(config.email.replyTo ? { replyTo: config.email.replyTo } : {}),
        }
      : {
          userId,
          type,
          title: rendered.subject,
          body: rendered.text || rendered.html,
          data: metadata,
        };

    const job = () => sendWithRetry({
      provider,
      message,
      type,
      retryCount: channel === "email" ? config.email.retryCount : 0,
      timeoutMs: channel === "email" ? config.email.timeoutMs : 10000,
      metadata,
      actor,
    });
    const { getNotificationQueue } = require("./notifications/queue");
    results.push(await (queue ? getNotificationQueue().enqueue(job) : job()));
  }

  return results.length === 1 ? results[0] : { success: results.some((result) => result.success), results };
}

async function verifyEmailProvider() {
  const config = getConfig();
  const registry = createNotificationRegistry(config, providerOverride);
  const provider = registry.get("email");
  const startedAt = Date.now();
  try {
    const result = await provider.verify();
    return { ...result, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { success: false, provider: provider.name, error: err.message, durationMs: Date.now() - startedAt };
  }
}

function listProviders(config = getConfig()) {
  return createNotificationRegistry(config, providerOverride).list();
}

function setNotificationProviderForTests(provider) {
  providerOverride = provider;
}

function setNotificationLoggerForTests(logger) {
  loggerOverride = logger;
}

function resetNotificationManagerForTests() {
  providerOverride = null;
  loggerOverride = null;
}

module.exports = {
  notify,
  verifyEmailProvider,
  listProviders,
  maskRecipient,
  setNotificationProviderForTests,
  setNotificationLoggerForTests,
  resetNotificationManagerForTests,
};
