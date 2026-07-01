const nodemailer = require("nodemailer");

function createSmtpProvider(config) {
  const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: { user: config.email.user, pass: config.email.pass },
    connectionTimeout: config.email.timeoutMs,
    greetingTimeout: config.email.timeoutMs,
    socketTimeout: config.email.timeoutMs,
  });

  return {
    name: "smtp",
    async send(message) {
      return transporter.sendMail(message);
    },
    async verify() {
      await transporter.verify();
      return { success: true, provider: "smtp" };
    },
  };
}

module.exports = { createSmtpProvider };
