const nodemailer = require("nodemailer");
const { getConfig } = require("../config/env");

const getTransporter = () => {
  const config = getConfig();
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: { user: config.email.user, pass: config.email.pass },
  });
};

async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: getConfig().email.from,
    to,
    subject,
    html,
  });
  if (getConfig().app.isDevelopment) {
    console.log("[Email] Sent to:", to, "| MessageId:", info.messageId);
  }
  return info;
}

const emailTemplates = {
  verifyEmail: (name, url) => ({
    subject: "Verify your email — Parentheses",
    html: `<p>Hi ${name},</p>
           <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
           <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2E75B6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Verify Email</a>
           <p>If you didn't create this account, you can safely ignore this email.</p>`,
  }),

  passwordReset: (name, url) => ({
    subject: "Reset your password — Parentheses",
    html: `<p>Hi ${name},</p>
           <p>We received a request to reset your password. Click below to reset it. This link expires in 1 hour.</p>
           <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2E75B6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Reset Password</a>
           <p>If you didn't request this, you can safely ignore this email.</p>`,
  }),

  licenseIssued: (name, licenseKey, productName) => ({
    subject: `Your license key for ${productName}`,
    html: `<p>Hi ${name},</p>
           <p>Thanks for your purchase! Your license key for <strong>${productName}</strong> is:</p>
           <p style="font-family:monospace;font-size:20px;font-weight:bold;letter-spacing:1px;background:#f3f4f6;padding:12px 16px;border-radius:8px;display:inline-block;">${licenseKey}</p>
           <p>You can view, activate, and manage this license anytime from your dashboard.</p>`,
  }),
};

module.exports = { sendEmail, emailTemplates };
