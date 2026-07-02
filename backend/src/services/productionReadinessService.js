const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { getConfig } = require("../config/env");
const { getRedisClient, isRedisConnected } = require("../config/redis");
const { verifyEmailProvider } = require("./notificationService");

const PLACEHOLDER_PATTERNS = [
  /^replace_/i,
  /replace_me/i,
  /dummy/i,
  /example\.com/i,
  /^sk_live_replace/i,
  /^whsec_replace/i,
  /^<.*>$/,
];

function hasPlaceholder(value = "") {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(value)));
}

function checkPathWritable(targetPath) {
  const absolute = path.resolve(process.cwd(), targetPath);
  fs.mkdirSync(absolute, { recursive: true });
  fs.accessSync(absolute, fs.constants.R_OK | fs.constants.W_OK);
  return absolute;
}

function issue(code, message, severity = "error", metadata = {}) {
  return { code, message, severity, ...metadata };
}

function validateProductionConfig(config = getConfig()) {
  const issues = [];
  const warnings = [];

  if (config.app.isProduction && config.app.appEnv !== "production") {
    issues.push(issue("env.mismatch", "NODE_ENV=production requires APP_ENV=production."));
  }
  if (!config.database.uri) issues.push(issue("database.missing_uri", "MONGO_URI is required."));
  if (!config.database.name) issues.push(issue("database.missing_name", "MONGO_DB_NAME is required."));
  if (config.app.isProduction && !String(config.database.uri).includes("mongodb+srv://")) {
    warnings.push(issue("database.non_atlas_uri", "Production should use a managed replica set such as MongoDB Atlas.", "warning"));
  }

  if (config.app.isProduction) {
    if (hasPlaceholder(config.auth.accessSecret) || hasPlaceholder(config.auth.refreshSecret)) {
      issues.push(issue("auth.placeholder_secret", "JWT secrets must be real, unique production secrets."));
    }
    if (!config.email.enabled) {
      issues.push(issue("email.not_configured", "SMTP settings are required for production email flows."));
    }
    if (config.features.ENABLE_STRIPE) {
      if (!config.payments.stripeSecretKey || hasPlaceholder(config.payments.stripeSecretKey)) {
        issues.push(issue("stripe.secret_missing", "STRIPE_SECRET_KEY must be a real production key when Stripe is enabled."));
      }
      if (!config.payments.stripeWebhookSecret || hasPlaceholder(config.payments.stripeWebhookSecret)) {
        issues.push(issue("stripe.webhook_secret_missing", "STRIPE_WEBHOOK_SECRET must be real when Stripe is enabled."));
      }
    }
    if (config.features.ENABLE_LOCAL_PSP) {
      if (hasPlaceholder(config.payments.localPspMerchantId) || hasPlaceholder(config.payments.localPspSecretKey)) {
        issues.push(issue("local_psp.placeholder_credentials", "Local PSP credentials must be real when Local PSP is enabled."));
      }
    }
    if (!config.security.redisEnabled) {
      warnings.push(issue("redis.disabled", "Redis is recommended in production for multi-instance rate limiting.", "warning"));
    }
    if (config.storage.provider === "local") {
      warnings.push(issue("storage.local_provider", "Local plugin storage is a single point of failure unless backed by a persistent volume.", "warning"));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

function getMaintenanceState(config = getConfig()) {
  return {
    maintenanceMode: config.operations.maintenanceMode,
    readOnlyMode: config.operations.readOnlyMode,
    emergencyShutdown: config.operations.emergencyShutdown,
  };
}

function getBackupReadiness(config = getConfig()) {
  const checks = {};
  const issues = [];

  try {
    checks.uploads = {
      ok: true,
      path: checkPathWritable(config.storage.pluginUploadDir),
      provider: config.storage.provider,
    };
  } catch (err) {
    checks.uploads = { ok: false, error: err.message };
    issues.push(issue("backup.uploads_unavailable", "Upload storage is not readable and writable."));
  }

  try {
    checks.backupRoot = {
      ok: true,
      path: checkPathWritable(config.operations.backupRoot),
    };
  } catch (err) {
    checks.backupRoot = { ok: false, error: err.message };
    issues.push(issue("backup.root_unavailable", "Backup root is not readable and writable."));
  }

  checks.database = {
    ok: Boolean(config.database.uri && config.database.name),
    strategy: "Use mongodump or managed Atlas snapshots outside the app process.",
    databaseName: config.database.name,
  };
  if (!checks.database.ok) issues.push(issue("backup.database_unconfigured", "Database backup cannot run without database configuration."));

  checks.configuration = {
    ok: true,
    includeEnv: config.operations.configBackupIncludeEnv,
    strategy: "Back up sanitized env manifests and deployment provider variables; never commit secrets.",
  };

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}

function getRestoreReadiness(config = getConfig()) {
  const backup = getBackupReadiness(config);
  const issues = [...backup.issues];
  const checks = {
    databaseConfigured: {
      ok: Boolean(config.database.uri && config.database.name),
      databaseName: config.database.name,
    },
    uploadsPresent: backup.checks.uploads,
    configPresent: {
      ok: Boolean(config.auth.accessSecret && config.auth.refreshSecret && config.database.uri),
      appEnv: config.app.appEnv,
      deploymentTarget: config.app.deploymentTarget,
    },
  };

  if (!checks.configPresent.ok) {
    issues.push(issue("restore.config_incomplete", "Restore validation requires database and auth configuration."));
  }

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}

async function runStartupDiagnostics({ verifySmtp = false } = {}) {
  const config = getConfig();
  const environment = validateProductionConfig(config);
  const backup = getBackupReadiness(config);
  const restore = getRestoreReadiness(config);
  const checks = {
    environment,
    backup,
    restore,
    filesystem: backup.checks.uploads,
    database: {
      ok: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      name: mongoose.connection.name || config.database.name,
    },
    cache: {
      ok: !config.security.redisEnabled || isRedisConnected(),
      enabled: config.security.redisEnabled,
      state: config.security.redisEnabled ? getRedisClient()?.status || "unavailable" : "disabled",
    },
    queue: {
      ok: true,
      mode: "inline",
    },
    maintenance: getMaintenanceState(config),
  };

  if (verifySmtp || config.email.verifyOnStartup) {
    checks.smtp = config.email.enabled ? await verifyEmailProvider() : { success: false, skipped: true, reason: "email_not_configured" };
  } else {
    checks.smtp = {
      success: config.email.enabled,
      skipped: true,
      reason: config.email.enabled ? "startup_smtp_verify_disabled" : "email_not_configured",
    };
  }

  const ok = environment.ok && backup.ok && restore.ok && checks.database.ok && checks.cache.ok;
  return {
    ok,
    status: ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  };
}

module.exports = {
  validateProductionConfig,
  getMaintenanceState,
  getBackupReadiness,
  getRestoreReadiness,
  runStartupDiagnostics,
};
