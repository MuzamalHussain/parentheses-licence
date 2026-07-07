const StripePaymentProvider = require("./paymentProviders/StripePaymentProvider");
const { LocalPspPaymentProvider } = require("./paymentProviders/LocalPspPaymentProvider");
const PlaceholderPaymentProvider = require("./paymentProviders/PlaceholderPaymentProvider");

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    if (!provider?.id) throw new Error("Payment provider must expose an id.");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Payment provider '${providerId}' is not registered.`);
    return provider;
  }

  list() {
    return Array.from(this.providers.keys());
  }
}

const registry = new ProviderRegistry();
registry.register(new StripePaymentProvider());
registry.register(new LocalPspPaymentProvider());
registry.register(new PlaceholderPaymentProvider("paypal"));
registry.register(new PlaceholderPaymentProvider("lemon_squeezy"));
registry.register(new PlaceholderPaymentProvider("paddle"));

module.exports = { ProviderRegistry, registry };
