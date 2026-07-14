const StripePaymentProvider = require("./paymentProviders/StripePaymentProvider");
const { LocalPspPaymentProvider } = require("./paymentProviders/LocalPspPaymentProvider");
const PlaceholderPaymentProvider = require("./paymentProviders/PlaceholderPaymentProvider");

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.legacyProviders = new Map();
  }

  register(provider) {
    if (!provider?.id) throw new Error("Payment provider must expose an id.");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId) {
    const provider = this.providers.get(providerId) || this.legacyProviders.get(providerId);
    if (!provider) throw new Error(`Payment provider '${providerId}' is not registered.`);
    return provider;
  }

  list() {
    return Array.from(this.providers.keys());
  }

  registerLegacy(provider) {
    if (!provider?.id) throw new Error("Legacy payment provider must expose an id.");
    this.legacyProviders.set(provider.id, provider);
    return provider;
  }
}

const registry = new ProviderRegistry();
registry.register(new StripePaymentProvider());
registry.register(new PlaceholderPaymentProvider("wise_business"));
registry.register(new PlaceholderPaymentProvider("hblpay_checkout"));
registry.registerLegacy(new LocalPspPaymentProvider());

module.exports = { ProviderRegistry, registry };
