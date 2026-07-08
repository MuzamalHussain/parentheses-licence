function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(label, url) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:#2E75B6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>`;
}

const templates = {
  verifyEmail: ({ name, url }) => ({
    subject: "Verify your email - Parentheses",
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
           ${button("Verify Email", url)}
           <p>If you didn't create this account, you can safely ignore this email.</p>`,
  }),

  passwordReset: ({ name, url }) => ({
    subject: "Reset your password - Parentheses",
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>We received a request to reset your password. Click below to reset it. This link expires in 1 hour.</p>
           ${button("Reset Password", url)}
           <p>If you didn't request this, you can safely ignore this email.</p>`,
  }),

  welcome: ({ name }) => ({
    subject: "Welcome to Parentheses",
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Welcome to Parentheses. Your licensing account is ready.</p>`,
  }),

  licensePurchased: ({ name, productName, licenseKey }) => ({
    subject: `Your license key for ${productName || "your plugin"}`,
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Thanks for your purchase! Your license key for <strong>${escapeHtml(productName || "your plugin")}</strong> is:</p>
           <p style="font-family:monospace;font-size:20px;font-weight:bold;letter-spacing:1px;background:#f3f4f6;padding:12px 16px;border-radius:8px;display:inline-block;">${escapeHtml(licenseKey)}</p>
           <p>You can view, activate, and manage this license anytime from your dashboard.</p>`,
  }),

  licenseRenewed: ({ name, productName }) => ({
    subject: `Your ${productName || "plugin"} license was renewed`,
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Your license for <strong>${escapeHtml(productName || "your plugin")}</strong> has been renewed.</p>`,
  }),

  licenseExpired: ({ name, productName }) => ({
    subject: `Your ${productName || "plugin"} license expired`,
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Your license for <strong>${escapeHtml(productName || "your plugin")}</strong> has expired.</p>`,
  }),

  downloadAvailable: ({ name, productName, versionNumber }) => ({
    subject: `${productName || "Plugin"} ${versionNumber || ""} is available`,
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>A download is available for <strong>${escapeHtml(productName || "your plugin")}</strong>${versionNumber ? ` version ${escapeHtml(versionNumber)}` : ""}.</p>`,
  }),

  adminAlert: ({ title, message }) => ({
    subject: `Admin alert: ${title || "Parentheses"}`,
    html: `<p><strong>${escapeHtml(title || "Admin alert")}</strong></p>
           <p>${escapeHtml(message || "")}</p>`,
  }),

  paymentSuccess: ({ name, productName }) => ({
    subject: "Payment received",
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Your payment${productName ? ` for <strong>${escapeHtml(productName)}</strong>` : ""} was successful.</p>`,
  }),

  paymentFailed: ({ name, productName }) => ({
    subject: "Payment failed",
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Your payment${productName ? ` for <strong>${escapeHtml(productName)}</strong>` : ""} could not be completed.</p>`,
  }),
};

function renderTemplate(type, payload = {}) {
  const renderer = templates[type];
  if (!renderer) throw new Error(`Unknown notification template: ${type}`);
  const rendered = renderer(payload);
  if (payload.brand && payload.applyBrand !== false) {
    const BrandingService = require("../branding/BrandingService");
    return BrandingService.themedEmail(rendered, payload.brand);
  }
  return rendered;
}

module.exports = { renderTemplate, templates };
