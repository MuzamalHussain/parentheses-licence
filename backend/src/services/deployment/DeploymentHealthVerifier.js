const Health = require("../infrastructure/HealthRegistry");
const Storage = require("../infrastructure/StorageProviderRegistry");
const Queue = require("../infrastructure/QueueArchitectureService");
const AIProviders = require("../ai/AIProviderRegistry");

async function verify(environment = "local") {
  const [health, queue] = await Promise.all([Health.snapshot(), Queue.status()]);
  const storage = Storage.describe();
  const providers = AIProviders.list ? AIProviders.list() : [];
  const checks = [
    { id: "application", status: health.status === "down" ? "failed" : "passed", details: health.status },
    { id: "database", status: health.services?.find((service) => service.id === "database")?.status === "down" ? "failed" : "passed" },
    { id: "queue", status: queue.databaseDisconnected ? "warning" : "passed", details: queue.stats || {} },
    { id: "storage", status: storage.activeProvider ? "passed" : "warning", details: storage.activeProvider },
    { id: "redis", status: health.services?.find((service) => service.id === "redis")?.status || "unknown" },
    { id: "ai_providers", status: providers.length ? "passed" : "warning", details: providers.length },
    { id: "email", status: health.services?.find((service) => service.id === "email")?.status || "unknown" },
    { id: "rest_api", status: "passed" },
  ];
  return {
    environment,
    status: checks.some((check) => check.status === "failed") ? "failed" : "passed",
    verifiedAt: new Date().toISOString(),
    checks,
  };
}

module.exports = { verify };
