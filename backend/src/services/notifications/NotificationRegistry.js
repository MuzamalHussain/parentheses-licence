const EmailNotificationProvider = require("./EmailNotificationProvider");
const InAppNotificationProvider = require("./InAppNotificationProvider");
const NotificationProviderInterface = require("./NotificationProviderInterface");

class PlaceholderProvider extends NotificationProviderInterface {
  constructor(channel) {
    super(channel, channel);
  }

  async send() {
    return { success: false, skipped: true, reason: `${this.channel}_not_configured` };
  }
}

class NotificationRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    this.providers.set(provider.channel, provider);
    return provider;
  }

  get(channel) {
    return this.providers.get(channel);
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      channel: provider.channel,
      name: provider.name,
      active: !["sms", "whatsapp", "push", "slack", "discord"].includes(provider.channel),
    }));
  }
}

function createNotificationRegistry(config, providerOverride = null) {
  const registry = new NotificationRegistry();
  registry.register(new EmailNotificationProvider(config, providerOverride));
  registry.register(new InAppNotificationProvider());
  for (const channel of ["sms", "whatsapp", "push", "slack", "discord"]) {
    registry.register(new PlaceholderProvider(channel));
  }
  return registry;
}

module.exports = { NotificationRegistry, createNotificationRegistry };
