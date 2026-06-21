const dns = require("dns");
const mongoose = require("mongoose");
const { getConfig } = require("./env");

async function connectDB() {
  const config = getConfig();
  const uri = config.database.uri;
  const dbName = config.database.name;
  const dnsServers = config.database.dnsServers;

  if (!uri) {
    console.error("MONGO_URI is not set in .env — cannot start server.");
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
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected.");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });
}

module.exports = connectDB;
