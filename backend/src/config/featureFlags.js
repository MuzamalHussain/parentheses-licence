const { getConfig } = require("./env");

const FEATURE_FLAG_META = {
  ENABLE_STRIPE: {
    group: "Payments",
    description: "Keeps current Stripe checkout and webhook behavior available.",
    reservedFor: null,
  },
  ENABLE_LOCAL_PSP: {
    group: "Payments",
    description: "Keeps current local PSP placeholder gateway behavior available.",
    reservedFor: null,
  },
  ENABLE_EMAIL_VERIFICATION_ENFORCEMENT: {
    group: "Email",
    description: "Reserved flag for controlling email verification enforcement in a later phase.",
    reservedFor: "Phase 7B",
  },
  ENABLE_WORDPRESS_UPDATER: {
    group: "WordPress Updater",
    description: "Reserved flag for WordPress updater controls.",
    reservedFor: "Phase 7C",
  },
  ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT: {
    group: "Security",
    description: "Reserved flag for stricter plugin upload scanning and validation.",
    reservedFor: "Phase 7C",
  },
  ENABLE_ADVANCED_SESSION_SECURITY: {
    group: "Security",
    description: "Reserved flag for advanced session and cookie hardening.",
    reservedFor: "Phase 7C",
  },
  ENABLE_WEBHOOK_STRICT_IDEMPOTENCY: {
    group: "Payments",
    description: "Reserved flag for stricter webhook idempotency handling.",
    reservedFor: "Phase 7B",
  },
  ENABLE_PAYMENT_TRANSACTIONS: {
    group: "Payments",
    description: "Reserved flag for payment transaction hardening.",
    reservedFor: "Phase 7B",
  },
  ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD: {
    group: "Licensing",
    description: "Reserved flag for atomic license activation guards.",
    reservedFor: "Phase 7C",
  },
};

function getFeatureFlags() {
  const { features } = getConfig();
  return Object.entries(FEATURE_FLAG_META).map(([key, meta]) => ({
    key,
    enabled: Boolean(features[key]),
    source: "env",
    readOnly: true,
    ...meta,
  }));
}

module.exports = { FEATURE_FLAG_META, getFeatureFlags };
