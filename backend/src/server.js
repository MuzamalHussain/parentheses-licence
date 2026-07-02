require("dotenv").config();
const { getConfig } = require("./config/env");
const app = require("./app");
const connectDB = require("./config/db");
const { runStartupDiagnostics } = require("./services/productionReadinessService");
const { registerGracefulShutdown } = require("./services/gracefulShutdown");
const { logInfo, logError } = require("./utils/logger");

const config = getConfig();

function formatIssues(issues = []) {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

async function startServer() {
  await connectDB();
  const diagnostics = await runStartupDiagnostics();
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
  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    logError("server.start_failed", { error: err });
    process.exit(1);
  });
}

module.exports = { startServer };
