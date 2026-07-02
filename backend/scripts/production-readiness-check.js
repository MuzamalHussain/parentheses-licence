require("dotenv").config();

const { getConfig } = require("../src/config/env");
const { validateProductionConfig, getBackupReadiness, getRestoreReadiness } = require("../src/services/productionReadinessService");

function printSection(name, result) {
  const status = result.ok ? "OK" : "FAILED";
  console.log(`${name}: ${status}`);
  for (const item of result.issues || []) console.log(`ERROR ${item.code}: ${item.message}`);
  for (const item of result.warnings || []) console.log(`WARN ${item.code}: ${item.message}`);
}

async function run() {
  const config = getConfig();
  const environment = validateProductionConfig(config);
  const backup = getBackupReadiness(config);
  const restore = getRestoreReadiness(config);

  printSection("environment", environment);
  printSection("backup", backup);
  printSection("restore", restore);

  const ok = environment.ok && backup.ok && restore.ok;
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(`production-readiness-check failed: ${err.message}`);
  process.exit(1);
});
