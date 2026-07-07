const NotificationTemplate = require("../../models/NotificationTemplate");
const mongoose = require("mongoose");
const { renderTemplate: renderLegacyTemplate, templates: legacyTemplates } = require("./templates");

const DEFAULT_TEMPLATE_DEFINITIONS = {
  registration: { subject: "Welcome to Parentheses", textBody: "Hi {{customer_name}}, your account has been created." },
  verifyEmail: { subject: "Verify your email - Parentheses", legacy: "verifyEmail", variables: ["customer_name", "url"] },
  passwordReset: { subject: "Reset your password - Parentheses", legacy: "passwordReset", variables: ["customer_name", "url"] },
  passwordChanged: { subject: "Your password was changed", textBody: "Hi {{customer_name}}, your password was changed." },
  welcome: { subject: "Welcome to Parentheses", legacy: "welcome", variables: ["customer_name"] },
  licenseCreated: { subject: "License created", textBody: "Your {{product_name}} license {{license_key}} is ready." },
  licensePurchased: { subject: "Your license key", legacy: "licensePurchased", variables: ["customer_name", "product_name", "license_key"] },
  licenseActivated: { subject: "License activated", textBody: "{{product_name}} was activated for {{site_domain}}." },
  licenseDeactivated: { subject: "License deactivated", textBody: "{{product_name}} was deactivated for {{site_domain}}." },
  licenseExpiring: { subject: "License expiring soon", textBody: "{{product_name}} expires on {{renewal_date}}." },
  licenseRenewed: { subject: "License renewed", legacy: "licenseRenewed", variables: ["customer_name", "product_name"] },
  licenseRevoked: { subject: "License revoked", textBody: "Your {{product_name}} license has been revoked." },
  licenseSuspended: { subject: "License suspended", textBody: "Your {{product_name}} license has been suspended." },
  orderCreated: { subject: "Order created", textBody: "Order {{order_number}} has been created." },
  orderPaid: { subject: "Payment received", legacy: "paymentSuccess", variables: ["customer_name", "product_name", "order_number"] },
  orderCancelled: { subject: "Order cancelled", textBody: "Order {{order_number}} was cancelled." },
  refund: { subject: "Refund recorded", textBody: "A refund was recorded for order {{order_number}}." },
  subscriptionRenewed: { subject: "Subscription renewed", textBody: "Your {{product_name}} subscription was renewed." },
  downloadReady: { subject: "Download ready", legacy: "downloadAvailable", variables: ["customer_name", "product_name", "version", "download_url"] },
  newVersionAvailable: { subject: "New version available", textBody: "{{product_name}} {{version}} is available." },
  criticalSecurityRelease: { subject: "Critical security release", textBody: "{{product_name}} {{version}} includes security fixes." },
  ticketCreated: { subject: "Support ticket created", textBody: "Your support ticket has been created." },
  replyAdded: { subject: "Support reply added", textBody: "A reply was added to your support ticket." },
  ticketClosed: { subject: "Support ticket closed", textBody: "Your support ticket was closed." },
  newCustomer: { subject: "New customer", textBody: "{{customer_name}} created an account." },
  failedPayment: { subject: "Payment failed", legacy: "paymentFailed", variables: ["customer_name", "product_name", "order_number"] },
  webhookFailure: { subject: "Webhook failure", textBody: "{{provider}} webhook {{event_id}} failed." },
  systemError: { subject: "System error", textBody: "{{message}}" },
  licenseAbuseAlert: { subject: "License abuse alert", textBody: "Potential abuse detected for {{license_key}}." },
  adminAlert: { subject: "Admin alert", legacy: "adminAlert", variables: ["title", "message"] },
  custom: { subject: "{{subject}}", textBody: "{{message}}" },
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePayload(payload = {}) {
  return {
    ...payload,
    customer_name: payload.customer_name || payload.name || payload.customerName || "",
    license_key: payload.license_key || payload.licenseKey || "",
    product_name: payload.product_name || payload.productName || "",
    order_number: payload.order_number || payload.orderNumber || "",
    renewal_date: payload.renewal_date || payload.renewalDate || "",
    download_url: payload.download_url || payload.downloadUrl || payload.url || "",
    version: payload.version || payload.versionNumber || "",
  };
}

function renderString(template = "", payload = {}, { html = false } = {}) {
  const normalized = normalizePayload(payload);
  return String(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = normalized[key] ?? "";
    return html ? escapeHtml(value) : String(value);
  });
}

function stripHtml(html = "") {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function getStoredTemplate(type, channel = "email") {
  if (mongoose.connection.readyState === 0) return null;
  try {
    return await NotificationTemplate.findOne({ key: type, channel, enabled: true }).lean();
  } catch {
    return null;
  }
}

async function renderTemplate(type, payload = {}, { channel = "email" } = {}) {
  const stored = await getStoredTemplate(type, channel);
  if (stored) {
    const subject = renderString(stored.subject, payload);
    const html = renderString(stored.htmlBody || stored.textBody, payload, { html: true });
    const text = renderString(stored.textBody || stripHtml(html), payload);
    return { subject, html, text, enabled: stored.enabled, variables: stored.variables || [] };
  }

  const definition = DEFAULT_TEMPLATE_DEFINITIONS[type];
  if (definition?.legacy && legacyTemplates[definition.legacy]) {
    const legacyPayload = normalizePayload(payload);
    const rendered = renderLegacyTemplate(definition.legacy, {
      ...payload,
      name: legacyPayload.customer_name,
      productName: legacyPayload.product_name,
      licenseKey: legacyPayload.license_key,
      versionNumber: legacyPayload.version,
      url: legacyPayload.download_url || payload.url,
    });
    return { ...rendered, text: rendered.text || stripHtml(rendered.html), enabled: true };
  }

  const fallback = definition || DEFAULT_TEMPLATE_DEFINITIONS.custom;
  const subject = renderString(fallback.subject || type, payload);
  const text = renderString(fallback.textBody || fallback.subject || type, payload);
  const html = `<p>${escapeHtml(text)}</p>`;
  return { subject, html, text, enabled: true, variables: fallback.variables || [] };
}

async function previewTemplate({ subject = "", htmlBody = "", textBody = "", payload = {} }) {
  return {
    subject: renderString(subject, payload),
    html: renderString(htmlBody || textBody, payload, { html: true }),
    text: renderString(textBody || stripHtml(htmlBody), payload),
  };
}

async function upsertTemplate({ key, channel = "email", subject, htmlBody, textBody, variables = [], enabled = true, actor = null }) {
  const update = {
    subject: sanitizeHeader(subject || ""),
    htmlBody: htmlBody || "",
    textBody: textBody || "",
    variables,
    enabled,
    updatedBy: actor?._id || null,
  };
  return NotificationTemplate.findOneAndUpdate(
    { key, channel },
    { $set: update, $setOnInsert: { key, channel } },
    { new: true, upsert: true, runValidators: true }
  );
}

function sanitizeHeader(value = "") {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

module.exports = {
  DEFAULT_TEMPLATE_DEFINITIONS,
  escapeHtml,
  renderString,
  renderTemplate,
  previewTemplate,
  upsertTemplate,
  sanitizeHeader,
};
