const assert = require("assert");

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/phase15a-test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15a-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15a-refresh-secret";
process.env.REDIS_ENABLED = process.env.REDIS_ENABLED || "false";

const ServiceRegistry = require("../src/services/infrastructure/ServiceRegistry");
const DependencyRegistry = require("../src/services/infrastructure/DependencyRegistry");
const Resolver = require("../src/services/infrastructure/ServiceStatusResolver");
const HealthRegistry = require("../src/services/infrastructure/HealthRegistry");
const QueueArchitecture = require("../src/services/infrastructure/QueueArchitectureService");
const Cache = require("../src/services/infrastructure/DistributedCacheService");
const StorageProviderRegistry = require("../src/services/infrastructure/StorageProviderRegistry");
const Infrastructure = require("../src/services/infrastructure/InfrastructureService");
const ShutdownCoordinator = require("../src/services/ShutdownCoordinator");
const { getStorageAdapter } = require("../src/services/storageService");

async function testServiceRegistryAndDependencies() {
  ServiceRegistry.resetForTests();
  const services = ServiceRegistry.list();
  assert.ok(services.some((service) => service.id === "api" && service.stateless));
  assert.ok(services.some((service) => service.id === "database" && service.critical));
  const validation = DependencyRegistry.validate();
  assert.strictEqual(validation.ok, true);
  assert.ok(DependencyRegistry.impactedServices("database").some((service) => service.id === "api" || service.id === "queue"));
}

async function testHealthAndStatusResolution() {
  assert.strictEqual(Resolver.normalize({ ok: false }), "down");
  assert.strictEqual(Resolver.overallStatus([{ critical: true, status: "down" }]), "down");
  const health = await HealthRegistry.snapshot();
  assert.ok(["ok", "degraded", "down"].includes(health.status));
  assert.ok(health.services.some((service) => service.id === "storage"));
}

async function testStorageProvidersAndCache() {
  assert.strictEqual(getStorageAdapter("local").provider, "local");
  assert.strictEqual(getStorageAdapter("s3").provider, "s3");
  assert.strictEqual(getStorageAdapter("r2").provider, "r2");
  assert.strictEqual(getStorageAdapter("azure_blob").provider, "azure_blob");
  assert.strictEqual(getStorageAdapter("gcs").provider, "gcs");
  const storage = StorageProviderRegistry.describe();
  assert.ok(storage.providers.some((provider) => provider.id === "r2"));
  await Cache.set("phase15a:test", { ok: true }, 5);
  assert.deepStrictEqual(await Cache.get("phase15a:test"), { ok: true });
  assert.ok(Cache.describe().capabilities.includes("distributed_cache"));
}

async function testQueueIsolationAndDashboard() {
  const queue = await QueueArchitecture.status();
  assert.ok(queue.workers.some((worker) => worker.id === "emails"));
  assert.ok(queue.workers.some((worker) => worker.id === "ai"));
  assert.strictEqual(queue.queueIsolation, true);
  const dashboard = await Infrastructure.dashboard();
  assert.strictEqual(dashboard.architecture.statelessApi, true);
  assert.ok(dashboard.queue.workers.length >= 7);
  assert.ok(dashboard.capacity.memory.totalSystemMb > 0);
}

async function testGracefulShutdownDrain() {
  ShutdownCoordinator.resetForTests();
  const server = { close: (cb) => cb() };
  const result = await ShutdownCoordinator.drain({ server, timeoutMs: 1000 });
  assert.strictEqual(result.ok, true);
  assert.ok(result.steps.some((step) => step.step === "close_http_server" && step.ok));
  assert.ok(result.steps.some((step) => step.step === "drain_queues"));
  assert.strictEqual(ShutdownCoordinator.status().acceptingRequests, false);
  ShutdownCoordinator.resetForTests();
}

(async () => {
  await testServiceRegistryAndDependencies();
  await testHealthAndStatusResolution();
  await testStorageProvidersAndCache();
  await testQueueIsolationAndDashboard();
  await testGracefulShutdownDrain();
  console.log("Phase 15A high availability and scalability tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
