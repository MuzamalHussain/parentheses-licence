const mongoose = require("mongoose");
const { getRedisClient } = require("../config/redis");
const { logInfo, logError } = require("../utils/logger");
const ShutdownCoordinator = require("./ShutdownCoordinator");

async function shutdown({ server = null, signal = "manual", exit = true, timeoutMs = 10_000 } = {}) {
  let timeout;
  try {
    logInfo("shutdown.started", { signal });
    timeout = setTimeout(() => {}, timeoutMs);
    const result = await ShutdownCoordinator.drain({ server, timeoutMs });
    if (timeout) clearTimeout(timeout);
    logInfo("shutdown.completed", { signal, result });
    if (exit) process.exit(0);
  } catch (err) {
    if (timeout) clearTimeout(timeout);
    logError("shutdown.failed", { signal, error: err });
    if (exit) process.exit(1);
    throw err;
  }
}

function registerGracefulShutdown(server) {
  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.once(signal, () => {
      shutdown({ server, signal }).catch(() => {});
    });
  });
}

module.exports = { shutdown, registerGracefulShutdown };
