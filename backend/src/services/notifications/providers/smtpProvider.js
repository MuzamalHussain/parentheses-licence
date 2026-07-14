const nodemailer = require("nodemailer");

function createSmtpProvider(config) {
  const transportOptions = {
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    requireTLS: !config.email.secure && config.email.port === 587,
    auth: { user: config.email.user, pass: config.email.pass },
    connectionTimeout: config.email.timeoutMs,
    greetingTimeout: config.email.timeoutMs,
    socketTimeout: config.email.timeoutMs,
  };

  return {
    name: "smtp",
    async send(message) {
      const transporter = nodemailer.createTransport(transportOptions);
      try {
        return await transporter.sendMail(message);
      } finally {
        transporter.close();
      }
    },
    async verify() {
      const transporter = nodemailer.createTransport(transportOptions);
      try {
        await transporter.verify();
        return { success: true, provider: "smtp" };
      } finally {
        transporter.close();
      }
    },
  };
}

module.exports = { createSmtpProvider };
