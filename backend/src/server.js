require("dotenv").config();
const { getConfig } = require("./config/env");
const app = require("./app");
const connectDB = require("./config/db");

const config = getConfig();

async function startServer() {
  await connectDB();
  app.listen(config.app.port, () => {
    console.log(`Server running on http://localhost:${config.app.port} [${config.app.nodeEnv}]`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
