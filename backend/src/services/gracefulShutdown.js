const mongoose = require("mongoose");
const { getRedisClient } = require("../config/redis");
const { logInfo, logError } = require("../utils/logger");

async function shutdown({ server = null, signal = "manual", exit = true, timeoutMs = 10_000 } = {}) {
  let timeout;
  try {
    logInfo("shutdown.started", { signal });
    const closeHttp = server
      ? new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("HTTP shutdown timeout")), timeoutMs);
          server.close((err) => (err ? reject(err) : resolve()));
        })
      : Promise.resolve();

    await closeHttp;
    if (timeout) clearTimeout(timeout);

    const redis = getRedisClient();
    if (redis?.status && redis.status !== "end") {
      await redis.quit().catch(() => redis.disconnect());
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    logInfo("shutdown.completed", { signal });
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
