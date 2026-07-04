const { getConfig } = require("../config/env");
const { AppError } = require("../utils/errorHandler");
const { logWarn } = require("../utils/logger");

const PROVIDERS = {
  stripe: {
    id: "stripe",
    name: "Stripe",
    adapterImplemented: true,
    enabledFlag: "ENABLE_STRIPE",
  },
  local: {
    id: "local",
    name: "JazzCash / EasyPaisa / Local PSP",
    adapterImplemented: false,
    enabledFlag: "ENABLE_LOCAL_PSP",
  },
};

const DUMMY_PATTERNS = [
  "dummy",
  "replace_me",
  "replace-with",
  "replace_with",
  "placeholder",
  "example.com",
  "sandbox.local-psp.example.com",
];

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isDummyValue(value) {
  if (!hasValue(value)) return true;
  const normalized = value.trim().toLowerCase();
  return DUMMY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function requiredValuesFor(providerId, config) {
  if (providerId === "stripe") {
    return [
      { name: "STRIPE_SECRET_KEY", value: config.payments.stripeSecretKey },
      { name: "STRIPE_WEBHOOK_SECRET", value: config.payments.stripeWebhookSecret },
    ];
  }

  if (providerId === "local") {
    return [
      { name: "LOCAL_PSP_BASE_URL", value: config.payments.localPspBaseUrl },
      { name: "LOCAL_PSP_MERCHANT_ID", value: config.payments.localPspMerchantId },
      { name: "LOCAL_PSP_SECRET_KEY", value: config.payments.localPspSecretKey },
    ];
  }

  return [];
}

function configurationStatus(providerId, config) {
  const missing = [];
  const dummy = [];

  for (const item of requiredValuesFor(providerId, config)) {
    if (!hasValue(item.value)) {
      missing.push(item.name);
    } else if (isDummyValue(item.value)) {
      dummy.push(item.name);
    }
  }

  return {
    configured: missing.length === 0 && dummy.length === 0,
    missing,
    dummy,
  };
}

function statusLabel(status) {
  if (status.operational) return "Operational";
  if (!status.enabled) return "Disabled";
  if (!status.adapterImplemented) return "Adapter Missing";
  if (!status.configured) return "Not Configured";
  return "Coming Soon";
}

function buildProviderStatus(providerId, config = getConfig()) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;

  const enabled = Boolean(config.features[provider.enabledFlag]);
  const configStatus = configurationStatus(providerId, config);

  let reason = "Operational";
  if (!enabled) {
    reason = "Provider disabled by environment.";
  } else if (!provider.adapterImplemented) {
    reason = "Provider adapter not implemented.";
  } else if (configStatus.dummy.length) {
    reason = "Dummy or placeholder credentials detected.";
  } else if (configStatus.missing.length) {
    reason = "Missing real credentials.";
  }

  const status = {
    id: provider.id,
    name: provider.name,
    enabled,
    configured: configStatus.configured,
    operational: enabled && provider.adapterImplemented && configStatus.configured,
    reason,
    adapterImplemented: provider.adapterImplemented,
    missingConfig: configStatus.missing,
    dummyConfig: configStatus.dummy,
  };

  return { ...status, label: statusLabel(status) };
}

function getPaymentProviderStatuses(config = getConfig()) {
  return Object.keys(PROVIDERS).map((providerId) => buildProviderStatus(providerId, config));
}

function assertProviderOperational(providerId, config = getConfig()) {
  const status = buildProviderStatus(providerId, config);
  if (!status) throw new AppError("Unsupported payment provider.", 422);

  if (!status.operational) {
    logWarn("payments.checkout_provider_blocked", {
      provider: providerId,
      enabled: status.enabled,
      configured: status.configured,
      adapterImplemented: status.adapterImplemented,
      reason: status.reason,
    });
    throw new AppError(`Payment provider is not available: ${status.reason}`, 503);
  }

  return status;
}

module.exports = {
  buildProviderStatus,
  getPaymentProviderStatuses,
  assertProviderOperational,
  isDummyValue,
};
