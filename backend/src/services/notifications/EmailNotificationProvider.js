const NotificationProviderInterface = require("./NotificationProviderInterface");
const { createEmailProvider } = require("./providers");

class EmailNotificationProvider extends NotificationProviderInterface {
  constructor(config, providerOverride = null) {
    const provider = providerOverride || createEmailProvider(config);
    super("email", provider.name);
    this.provider = provider;
  }

  async send(message) {
    return this.provider.send(message);
  }

  async verify() {
    if (!this.provider.verify) return { success: true, provider: this.name, channel: this.channel };
    return this.provider.verify();
  }
}

module.exports = EmailNotificationProvider;
