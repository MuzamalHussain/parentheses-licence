const nodemailer = require("nodemailer");

function buildTransportOptions(config) {
  return {
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    requireTLS: config.email.requireTLS,
    auth: { user: config.email.user, pass: config.email.pass },
    connectionTimeout: config.email.connectionTimeout || config.email.timeoutMs,
    greetingTimeout: config.email.greetingTimeout || config.email.timeoutMs,
    socketTimeout: config.email.socketTimeout || config.email.timeoutMs,
  };
}

function createSmtpProvider(config, mailer = nodemailer) {
  const transportOptions = buildTransportOptions(config);

  return {
    name: "smtp",
    async send(message) {
      const transporter = mailer.createTransport(transportOptions);
      try {
        return await transporter.sendMail(message);
      } finally {
        transporter.close();
      }
    },
    async verify() {
      const transporter = mailer.createTransport(transportOptions);
      try {
        await transporter.verify();
        return { success: true, provider: "smtp" };
      } finally {
        transporter.close();
      }
    },
  };
}

module.exports = { createSmtpProvider, buildTransportOptions };
