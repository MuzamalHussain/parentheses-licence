const { createSmtpProvider } = require("./smtpProvider");

function createEmailProvider(config) {
  const provider = config.email.provider;
  if (provider === "smtp") return createSmtpProvider(config);

  throw new Error(`Email provider '${provider}' is not implemented yet.`);
}

module.exports = { createEmailProvider };
