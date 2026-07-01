const notificationService = require("../services/notificationService");
const { renderTemplate } = require("../services/notifications/templates");

async function sendEmail({ to, subject, html }) {
  return notificationService.notify("custom", {
    to,
    subject,
    html,
  });
}

const emailTemplates = {
  verifyEmail: (name, url) => renderTemplate("verifyEmail", { name, url }),
  passwordReset: (name, url) => renderTemplate("passwordReset", { name, url }),
  licenseIssued: (name, licenseKey, productName) =>
    renderTemplate("licensePurchased", { name, licenseKey, productName }),
};

module.exports = { sendEmail, emailTemplates };
