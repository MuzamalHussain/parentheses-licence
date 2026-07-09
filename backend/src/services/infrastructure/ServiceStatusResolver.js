function normalize(check = {}) {
  if (check.ok === false || check.status === "down" || check.status === "error" || check.status === "unavailable") return "down";
  if (check.status === "degraded" || check.warning || check.ok === null) return "degraded";
  return "ok";
}

function overallStatus(services = []) {
  const criticalDown = services.some((service) => service.critical && service.status === "down");
  if (criticalDown) return "down";
  if (services.some((service) => service.status === "down" || service.status === "degraded")) return "degraded";
  return "ok";
}

function resolve(service, check = {}) {
  const status = normalize(check);
  return {
    id: service.id,
    name: service.name,
    type: service.type,
    critical: Boolean(service.critical),
    stateless: Boolean(service.stateless),
    scalable: Boolean(service.scalable),
    dependencies: service.dependencies || [],
    status,
    ok: status === "ok",
    details: check,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { normalize, overallStatus, resolve };
