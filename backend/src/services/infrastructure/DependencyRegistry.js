const ServiceRegistry = require("./ServiceRegistry");

function graph() {
  return ServiceRegistry.list().map((service) => ({
    id: service.id,
    name: service.name,
    type: service.type,
    critical: service.critical,
    dependencies: service.dependencies || [],
  }));
}

function impactedServices(dependencyId) {
  return graph().filter((service) => service.dependencies.includes(dependencyId));
}

function validate() {
  const known = new Set(ServiceRegistry.list().map((service) => service.id));
  const issues = [];
  graph().forEach((service) => {
    (service.dependencies || []).forEach((dependency) => {
      if (!known.has(dependency)) issues.push({ serviceId: service.id, dependency, code: "UNKNOWN_DEPENDENCY" });
    });
  });
  return { ok: issues.length === 0, issues };
}

module.exports = { graph, impactedServices, validate };
