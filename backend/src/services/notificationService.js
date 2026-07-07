const NotificationManager = require("./NotificationManager");
const TemplateService = require("./notifications/NotificationTemplateService");

async function notify(type, options = {}) {
  return NotificationManager.notify(type, options);
}

async function sendVerificationEmail({ to, name, url, userId }) {
  return notify("verifyEmail", { to, userId, payload: { name, customer_name: name, url } });
}

async function sendPasswordResetEmail({ to, name, url, userId }) {
  return notify("passwordReset", { to, userId, payload: { name, customer_name: name, url } });
}

async function sendWelcomeEmail({ to, name, userId }) {
  return notify("welcome", { to, userId, payload: { name, customer_name: name } });
}

async function sendLicensePurchasedEmail({ to, name, productName, licenseKey, userId }) {
  return notify("licensePurchased", {
    to,
    userId,
    payload: { name, customer_name: name, productName, product_name: productName, licenseKey, license_key: licenseKey },
  });
}

async function verifyEmailProvider() {
  return NotificationManager.verifyEmailProvider();
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
  NotificationManager.setNotificationProviderForTests(provider);
}

function setNotificationLoggerForTests(logger) {
  NotificationManager.setNotificationLoggerForTests(logger);
}

function resetNotificationServiceForTests() {
  NotificationManager.resetNotificationManagerForTests();
}

module.exports = {
  notify,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLicensePurchasedEmail,
  verifyEmailProvider,
  sendTestEmail,
  renderTemplate: TemplateService.renderTemplate,
  setNotificationProviderForTests,
  setNotificationLoggerForTests,
  resetNotificationServiceForTests,
};
