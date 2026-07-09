class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.registerDefaults();
  }

  register(service) {
    if (!service?.id) throw new Error("Service must include an id.");
    this.services.set(service.id, {
      critical: false,
      scalable: true,
      stateless: true,
      dependencies: [],
      ...service,
    });
    return this.services.get(service.id);
  }

  get(id) {
    return this.services.get(id) || null;
  }

  list() {
    return Array.from(this.services.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  registerDefaults() {
    [
      { id: "api", name: "Express API", type: "application", critical: true, stateless: true, dependencies: ["database", "cache", "storage"] },
      { id: "database", name: "MongoDB", type: "database", critical: true, scalable: true, stateless: false },
      { id: "cache", name: "Redis Cache", type: "cache", critical: false, dependencies: ["redis"] },
      { id: "redis", name: "Redis", type: "cache", critical: false, stateless: false },
      { id: "storage", name: "Release Storage", type: "storage", critical: true, stateless: false },
      { id: "queue", name: "Workflow Queue", type: "queue", critical: false, dependencies: ["database"] },
      { id: "email", name: "Email Service", type: "notification", critical: false },
      { id: "ai", name: "AI Platform", type: "ai", critical: false, dependencies: ["database", "cache"] },
      { id: "webhooks", name: "Webhook Delivery", type: "integration", critical: false, dependencies: ["queue"] },
    ].forEach((service) => this.register(service));
  }

  resetForTests() {
    this.services.clear();
    this.registerDefaults();
  }
}

module.exports = new ServiceRegistry();
module.exports.ServiceRegistry = ServiceRegistry;
