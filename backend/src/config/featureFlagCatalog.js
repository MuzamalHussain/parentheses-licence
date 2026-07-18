const { getConfig } = require("./env");
const legacy = (key, name, category, configKey, dependencies = []) => ({ key, name, category, defaultValue: Boolean(getConfig().features[configKey]), envKey: configKey, dependencies });
const CATALOG = [
  legacy("payments.stripe", "Stripe Payments", "payments", "ENABLE_STRIPE"), legacy("payments.local_psp", "Local PSP", "payments", "ENABLE_LOCAL_PSP"),
  legacy("email.verification_enforcement", "Email Verification Enforcement", "email", "ENABLE_EMAIL_VERIFICATION_ENFORCEMENT"), legacy("plugin_updates.wordpress", "WordPress Plugin Updates", "plugin_updates", "ENABLE_WORDPRESS_UPDATER", ["licensing.core"]),
  legacy("security.plugin_upload_strict", "Strict Plugin Upload Security", "security", "ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT"), legacy("security.advanced_sessions", "Advanced Session Security", "security", "ENABLE_ADVANCED_SESSION_SECURITY"),
  legacy("payments.webhook_idempotency", "Strict Webhook Idempotency", "payments", "ENABLE_WEBHOOK_STRICT_IDEMPOTENCY"), legacy("payments.transactions", "Payment Transactions", "payments", "ENABLE_PAYMENT_TRANSACTIONS"),
  legacy("licensing.atomic_activation", "Atomic License Activation", "licensing", "ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD", ["licensing.core"]),
  { key: "licensing.core", name: "Licensing", category: "licensing", defaultValue: true }, { key: "storage.core", name: "Storage", category: "storage", defaultValue: true },
  { key: "downloads.core", name: "Downloads", category: "downloads", defaultValue: true, dependencies: ["storage.core"] }, { key: "ai.providers", name: "AI Providers", category: "ai", defaultValue: true },
  { key: "reports.ai", name: "AI Reports", category: "reports", defaultValue: false, dependencies: ["ai.providers"] }, { key: "maintenance.global", name: "Maintenance Mode", category: "maintenance", defaultValue: false },
];
const MAINTENANCE_DEFAULT = { enabled: false, message: "Scheduled maintenance is in progress.", allowedRoles: ["admin"], allowedIps: [], scheduledStart: null, scheduledEnd: null, apiMode: true, frontendMode: true };
module.exports = { CATALOG, MAINTENANCE_DEFAULT };
