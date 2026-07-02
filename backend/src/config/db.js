const dns = require("dns");
const mongoose = require("mongoose");
const { getConfig } = require("./env");
const { logInfo, logWarn, logError } = require("../utils/logger");

async function connectDB() {
  const config = getConfig();
  const uri = config.database.uri;
  const dbName = config.database.name;
  const dnsServers = config.database.dnsServers;

  if (!uri) {
    logError("database.config_missing", { key: "MONGO_URI" });
    process.exit(1);
  }

  if (dnsServers.length) {
    dns.setServers(dnsServers);
  }

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      autoIndex: !config.app.isProduction,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      ...(dbName ? { dbName } : {}),
    });
    logInfo("database.connected", {
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    });
  } catch (err) {
    logError("database.connect_failed", { error: err });
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    logWarn("database.disconnected");
  });

  mongoose.connection.on("error", (err) => {
    logError("database.error", { error: err });
  });
}

module.exports = connectDB;
