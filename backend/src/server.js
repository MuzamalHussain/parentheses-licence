require("dotenv").config();
const { logInfo, logError } = require("./utils/logger");

const ENV_KEYS = [
  "NODE_ENV",
  "APP_ENV",
  "DEPLOYMENT_TARGET",
  "PORT",
  "CLIENT_URL",
  "CORS_ORIGIN",
  "MONGO_URI",
  "MONGO_DB_NAME",
  "DNS_SERVERS",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_ACCESS_EXPIRES",
  "JWT_REFRESH_EXPIRES",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "AUTH_MAX_FAILED_LOGIN_ATTEMPTS",
  "AUTH_LOGIN_LOCKOUT_MINUTES",
  "AUTH_MAX_REFRESH_SESSIONS",
  "REDIS_ENABLED",
  "REDIS_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_REQUIRE_TLS",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_REPLY_TO",
  "EMAIL_PROVIDER",
  "EMAIL_ENABLED",
  "EMAIL_RETRY_COUNT",
  "EMAIL_TIMEOUT_MS",
  "STARTUP_VERIFY_SMTP",
  "STRIPE_ENABLED",
  "ENABLE_STRIPE",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LOCAL_PSP_ENABLED",
  "ENABLE_LOCAL_PSP",
  "LOCAL_PSP_BASE_URL",
  "LOCAL_PSP_MERCHANT_ID",
  "LOCAL_PSP_SECRET_KEY",
  "STORAGE_PROVIDER",
  "UPLOAD_ROOT",
  "BACKUP_ROOT",
  "CONFIG_BACKUP_INCLUDE_ENV",
  "BACKUP_READINESS_STRICT",
  "MAINTENANCE_MODE",
  "READ_ONLY_MODE",
  "EMERGENCY_SHUTDOWN",
  "ENABLE_EMAIL_VERIFICATION_ENFORCEMENT",
  "ENABLE_WORDPRESS_UPDATER",
  "ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT",
  "ENABLE_ADVANCED_SESSION_SECURITY",
  "ENABLE_WEBHOOK_STRICT_IDEMPOTENCY",
  "ENABLE_PAYMENT_TRANSACTIONS",
  "ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD",
  "PLUGIN_ZIP_MAX_UPLOAD_MB",
  "PLUGIN_ZIP_MAX_UNCOMPRESSED_MB",
  "PLUGIN_ZIP_MAX_FILES",
  "PLUGIN_ZIP_MAX_COMPRESSION_RATIO",
];

const SECRET_KEY_PATTERN = /(SECRET|PASS|PASSWORD|TOKEN|KEY|URI|URL|DSN|AUTH|COOKIE|SIGNATURE|STRIPE|PAYMENT)/i;

function maskEnvValue(key, value) {
  if (value === undefined || value === "") return value;
  const stringValue = String(value);
  if (!SECRET_KEY_PATTERN.test(key)) return stringValue;
  if (stringValue.length <= 8) return "[MASKED]";
  return `${stringValue.slice(0, 4)}...[MASKED]...${stringValue.slice(-4)}`;
}

function buildEnvSnapshot(keys = ENV_KEYS) {
  return keys.reduce((snapshot, key, index) => {
    const value = process.env[key];
    snapshot[`env_${String(index + 1).padStart(2, "0")}`] = {
      key,
      present: value !== undefined && value !== "",
      value: maskEnvValue(key, value),
    };
    return snapshot;
  }, {});
}

function formatIssues(issues = []) {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

async function startServer() {
  logInfo("startup.begin", {
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    cwd: process.cwd(),
  });

  logInfo("startup.env.raw_snapshot", { env: buildEnvSnapshot() });

  const { getConfig } = require("./config/env");
  const config = getConfig();
  logInfo("startup.env.validation_complete", {
    nodeEnv: config.app.nodeEnv,
    appEnv: config.app.appEnv,
    deploymentTarget: config.app.deploymentTarget,
    port: config.app.port,
    clientOrigins: config.app.clientOrigins,
    emailEnabled: config.email.enabled,
    redisEnabled: config.security.redisEnabled,
    backupReadinessStrict: config.operations.backupReadinessStrict,
    features: config.features,
  });

  const connectDB = require("./config/db");
  logInfo("startup.database.begin");
  await connectDB();
  logInfo("startup.database.complete");

  logInfo("startup.routes.begin");
  const app = require("./app");
  logInfo("startup.routes.complete");

  logInfo("startup.diagnostics.begin");
  const { runStartupDiagnostics } = require("./services/productionReadinessService");
  const diagnostics = await runStartupDiagnostics();
  logInfo("startup.email.complete", {
    enabled: config.email.enabled,
    smtp: diagnostics.checks.smtp,
  });
  logInfo("startup.scheduler.complete", {
    enabled: false,
    reason: "no startup scheduler configured",
  });
  logInfo("startup.diagnostics.complete", {
    status: diagnostics.status,
    environment: diagnostics.checks.environment,
    backup: diagnostics.checks.backup,
    restore: diagnostics.checks.restore,
    database: diagnostics.checks.database,
    cache: diagnostics.checks.cache,
  });

  if (config.app.isProduction && !diagnostics.checks.environment.ok) {
    throw new Error(
      `Production environment validation failed: ${formatIssues(diagnostics.checks.environment.issues)}`
    );
  }
  if (config.app.isProduction && config.operations.backupReadinessStrict && !diagnostics.checks.backup.ok) {
    throw new Error(
      `Production backup readiness validation failed: ${formatIssues(diagnostics.checks.backup.issues)}`
    );
  }

  const { registerGracefulShutdown } = require("./services/gracefulShutdown");
  logInfo("startup.server_listen.begin", { port: config.app.port });
  const server = app.listen(config.app.port, () => {
    logInfo("server.started", {
      port: config.app.port,
      nodeEnv: config.app.nodeEnv,
      appEnv: config.app.appEnv,
      deploymentTarget: config.app.deploymentTarget,
      diagnosticsStatus: diagnostics.status,
    });
  });
  registerGracefulShutdown(server);
  logInfo("startup.server_listen.complete", { port: config.app.port });
  return server;
}

function logFatal(event, err) {
  logError(event, {
    error: err,
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  });
}

if (require.main === module) {
  process.on("uncaughtException", (err) => {
    logFatal("process.uncaught_exception", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logFatal("process.unhandled_rejection", err);
    process.exit(1);
  });

  startServer().catch((err) => {
    logFatal("server.start_failed", err);
    process.exit(1);
  });
}

module.exports = { startServer, buildEnvSnapshot, maskEnvValue };
