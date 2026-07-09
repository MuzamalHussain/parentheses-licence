const HealthRegistry = require("./HealthRegistry");
const DependencyRegistry = require("./DependencyRegistry");
const Cache = require("./DistributedCacheService");
const Queue = require("./QueueArchitectureService");
const Capacity = require("./CapacityMetricsService");
const StorageProviderRegistry = require("./StorageProviderRegistry");

async function dashboard() {
  const [health, queue, capacity] = await Promise.all([
    HealthRegistry.snapshot(),
    Queue.status(),
    Capacity.snapshot(),
  ]);
  return {
    architecture: {
      statelessApi: true,
      horizontalScalingReady: true,
      multipleApiInstances: true,
      sharedSessions: "redis/session-cache foundation",
      futureKubernetes: true,
      loadBalancers: ["nginx", "haproxy", "cloudflare", "railway", "render", "fly.io", "kubernetes_ingress"],
    },
    health,
    dependencies: DependencyRegistry.graph(),
    dependencyValidation: DependencyRegistry.validate(),
    cache: Cache.describe(),
    storage: StorageProviderRegistry.describe(),
    queue,
    capacity,
  };
}

module.exports = { dashboard };
