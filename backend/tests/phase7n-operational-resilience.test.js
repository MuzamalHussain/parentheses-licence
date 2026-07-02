const assert = require("assert");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function resetConfigModules() {
  [
    "src/config/env.js",
    "src/config/redis.js",
    "src/services/productionReadinessService.js",
    "src/services/diagnosticsService.js",
    "src/services/gracefulShutdown.js",
  ].forEach((relativePath) => {
    try { clearModule(relativePath); } catch (_) {}
  });
}

async function withEnv(overrides, fn) {
  const previous = { ...process.env };
  Object.assign(process.env, overrides);
  resetConfigModules();
  try {
    await fn();
  } finally {
    process.env = previous;
    resetConfigModules();
  }
}

function validBaseEnv() {
  return {
    NODE_ENV: "test",
    APP_ENV: "test",
    DEPLOYMENT_TARGET: "local",
    MONGO_URI: "mongodb://127.0.0.1:27017/parentheses_phase7n",
    MONGO_DB_NAME: "parentheses_phase7n",
    JWT_ACCESS_SECRET: "phase7n_access_secret_abcdefghijklmnopqrstuvwxyz",
    JWT_REFRESH_SECRET: "phase7n_refresh_secret_abcdefghijklmnopqrstuvwxyz",
    REDIS_ENABLED: "false",
    ENABLE_STRIPE: "false",
    ENABLE_LOCAL_PSP: "false",
    UPLOAD_ROOT: "tmp/phase7n/uploads",
    BACKUP_ROOT: "tmp/phase7n/backups",
  };
}

async function testProductionEnvRejectsPlaceholderSecrets() {
  await withEnv({
    ...validBaseEnv(),
    NODE_ENV: "production",
    APP_ENV: "production",
    CLIENT_URL: "https://app.example.com",
    JWT_ACCESS_SECRET: "replace_with_random_access_secret_replace",
    JWT_REFRESH_SECRET: "replace_with_random_refresh_secret_replace",
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "no-reply@example.com",
    SMTP_PASS: "replace_with_smtp_password",
    SMTP_FROM: "no-reply@example.com",
    ENABLE_STRIPE: "true",
    STRIPE_SECRET_KEY: "sk_live_replace_me",
    STRIPE_WEBHOOK_SECRET: "whsec_replace_me",
  }, async () => {
    const { getConfig } = require(path.join(root, "src/config/env.js"));
    const { validateProductionConfig } = require(path.join(root, "src/services/productionReadinessService.js"));
    const result = validateProductionConfig(getConfig());
    assert.strictEqual(result.ok, false);
    assert.ok(result.issues.some((item) => item.code === "auth.placeholder_secret"));
    assert.ok(result.issues.some((item) => item.code === "stripe.secret_missing"));
  });
}

async function testEnvironmentIsolationRejectsMismatchedProductionAppEnv() {
  await withEnv({
    ...validBaseEnv(),
    NODE_ENV: "production",
    APP_ENV: "staging",
    CLIENT_URL: "https://app.example.com",
  }, async () => {
    assert.throws(
      () => require(path.join(root, "src/config/env.js")).getConfig(),
      /APP_ENV must be production/
    );
  });
}

async function testBackupAndRestoreReadiness() {
  await withEnv(validBaseEnv(), async () => {
    const {
      getBackupReadiness,
      getRestoreReadiness,
    } = require(path.join(root, "src/services/productionReadinessService.js"));

    const backup = getBackupReadiness();
    const restore = getRestoreReadiness();

    assert.strictEqual(backup.ok, true);
    assert.strictEqual(restore.ok, true);
    assert.ok(backup.checks.uploads.path.endsWith(path.join("tmp", "phase7n", "uploads", "plugins")));
    assert.ok(backup.checks.backupRoot.path.endsWith(path.join("tmp", "phase7n", "backups")));
  });
}

async function testStartupDiagnosticsReportOperationalChecks() {
  await withEnv(validBaseEnv(), async () => {
    const { runStartupDiagnostics } = require(path.join(root, "src/services/productionReadinessService.js"));
    const diagnostics = await runStartupDiagnostics();

    assert.strictEqual(diagnostics.checks.environment.ok, true);
    assert.strictEqual(diagnostics.checks.backup.ok, true);
    assert.strictEqual(diagnostics.checks.restore.ok, true);
    assert.strictEqual(diagnostics.checks.database.ok, false);
    assert.strictEqual(diagnostics.status, "degraded");
  });
}

async function testDiagnosticsIncludeOperationalReadiness() {
  await withEnv(validBaseEnv(), async () => {
    const { getSystemDiagnostics } = require(path.join(root, "src/services/diagnosticsService.js"));
    const diagnostics = await getSystemDiagnostics();

    assert.ok(diagnostics.checks.operations);
    assert.ok(diagnostics.checks.operations.backup);
    assert.ok(diagnostics.checks.operations.restore);
    assert.deepStrictEqual(diagnostics.checks.operations.maintenance, {
      maintenanceMode: false,
      readOnlyMode: false,
      emergencyShutdown: false,
    });
  });
}

async function testGracefulShutdownClosesHttpServer() {
  await withEnv(validBaseEnv(), async () => {
    const { shutdown } = require(path.join(root, "src/services/gracefulShutdown.js"));
    const server = await new Promise((resolve) => {
      const instance = http.createServer((req, res) => res.end("ok")).listen(0, () => resolve(instance));
    });

    await shutdown({ server, signal: "test", exit: false });
    assert.strictEqual(server.listening, false);
  });
}

async function run() {
  const tests = [
    testProductionEnvRejectsPlaceholderSecrets,
    testEnvironmentIsolationRejectsMismatchedProductionAppEnv,
    testBackupAndRestoreReadiness,
    testStartupDiagnosticsReportOperationalChecks,
    testDiagnosticsIncludeOperationalReadiness,
    testGracefulShutdownClosesHttpServer,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit(0));
