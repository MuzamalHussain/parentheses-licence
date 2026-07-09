const events = [];
const flaggedIps = new Set();

function record(event = {}) {
  const item = {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    severity: event.severity || "low",
    type: event.type || "security_event",
    ip: event.ip || "",
    userId: event.userId || "",
    organizationId: event.organizationId || "",
    module: event.module || "api",
    message: event.message || "",
    metadata: event.metadata || {},
  };
  events.push(item);
  while (events.length > 250) events.shift();
  if (["high", "critical"].includes(item.severity) && item.ip) flaggedIps.add(item.ip);
  return item;
}

function inspectRequest(req, decision) {
  if (decision.risk.score >= 35) {
    return record({
      severity: decision.risk.level,
      type: "runtime_anomaly",
      ip: req.ip,
      userId: req.user?._id,
      organizationId: req.organization?._id || req.user?.organizationId,
      module: "api",
      message: "Request risk score exceeded monitoring threshold.",
      metadata: { risk: decision.risk, endpoint: req.originalUrl?.split("?")[0], method: req.method },
    });
  }
  return null;
}

function isIpFlagged(ip) {
  return flaggedIps.has(ip);
}

function snapshot() {
  return {
    total: events.length,
    critical: events.filter((event) => event.severity === "critical").length,
    high: events.filter((event) => event.severity === "high").length,
    medium: events.filter((event) => event.severity === "medium").length,
    flaggedIps: flaggedIps.size,
    events: events.slice(-50),
  };
}

function resetForTests() {
  events.length = 0;
  flaggedIps.clear();
}

module.exports = { inspectRequest, isIpFlagged, record, resetForTests, snapshot };
