const crypto = require("crypto");
const { writeAuditLog } = require("../../utils/auditLog");

const incidents = new Map();

function create({ title, severity = "medium", affectedServices = [], source = "monitoring", metadata = {}, actor = null, ip = "", requestId = "" }) {
  const id = crypto.randomUUID();
  const incident = {
    id,
    title,
    severity,
    affectedServices,
    source,
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    timeline: [{ at: new Date().toISOString(), event: "created", severity, metadata }],
    resolutionNotes: "",
    recoveryStatus: "investigating",
  };
  incidents.set(id, incident);
  writeAuditLog({ actor, action: "observability.incident_created", targetType: "Incident", targetId: id, metadata: incident, ip, requestId });
  return incident;
}

function resolve(id, { notes = "", actor = null, ip = "", requestId = "" } = {}) {
  const incident = incidents.get(id);
  if (!incident) return null;
  incident.status = "resolved";
  incident.resolvedAt = new Date().toISOString();
  incident.resolutionNotes = notes;
  incident.recoveryStatus = "recovered";
  incident.timeline.push({ at: new Date().toISOString(), event: "resolved", notes });
  writeAuditLog({ actor, action: "observability.incident_resolved", targetType: "Incident", targetId: id, metadata: { notes }, ip, requestId });
  return incident;
}

function detect({ metrics, health }) {
  const created = [];
  if (health?.status === "down" && !Array.from(incidents.values()).some((item) => item.status === "open" && item.source === "health")) {
    created.push(create({ title: "Platform health is down", severity: "critical", affectedServices: health.services?.filter((s) => s.status === "down").map((s) => s.id) || [], source: "health" }));
  }
  if (metrics?.api?.errorRate >= 0.05 && !Array.from(incidents.values()).some((item) => item.status === "open" && item.source === "api_error_rate")) {
    created.push(create({ title: "API error rate above threshold", severity: "high", affectedServices: ["api"], source: "api_error_rate", metadata: { errorRate: metrics.api.errorRate } }));
  }
  return created;
}

function list(filters = {}) {
  return Array.from(incidents.values()).filter((incident) => {
    if (filters.status && incident.status !== filters.status) return false;
    if (filters.severity && incident.severity !== filters.severity) return false;
    return true;
  });
}

function snapshot() {
  const all = list();
  return {
    total: all.length,
    open: all.filter((incident) => incident.status === "open").length,
    resolved: all.filter((incident) => incident.status === "resolved").length,
    incidents: all.slice(-50),
  };
}

function resetForTests() {
  incidents.clear();
}

module.exports = { create, detect, list, resetForTests, resolve, snapshot };
