const crypto = require("crypto");
const { sanitizeLogData } = require("../../utils/logger");

const logs = [];
const MAX_LOGS = 500;

function boundedPush(item) {
  logs.push(item);
  while (logs.length > MAX_LOGS) logs.shift();
}

function normalizeSeverity(severity = "info") {
  const lower = String(severity).toLowerCase();
  return ["debug", "info", "warn", "error", "critical"].includes(lower) ? lower : "info";
}

function write(event, data = {}) {
  const entry = sanitizeLogData({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: normalizeSeverity(data.severity || data.level),
    event,
    requestId: data.requestId || "",
    traceId: data.traceId || "",
    userId: data.userId || "",
    organizationId: data.organizationId || "",
    module: data.module || "platform",
    endpoint: data.endpoint || data.path || "",
    durationMs: data.durationMs ?? null,
    status: data.status || data.statusCode || "",
    message: data.message || "",
    metadata: data.metadata || {},
  });
  boundedPush(entry);
  return entry;
}

function query(filters = {}) {
  return logs.filter((log) => {
    if (filters.module && log.module !== filters.module) return false;
    if (filters.organizationId && String(log.organizationId) !== String(filters.organizationId)) return false;
    if (filters.severity && log.severity !== filters.severity) return false;
    if (filters.traceId && log.traceId !== filters.traceId) return false;
    if (filters.endpoint && !String(log.endpoint).includes(filters.endpoint)) return false;
    return true;
  }).slice(-Number(filters.limit || 100));
}

function snapshot() {
  const bySeverity = logs.reduce((acc, log) => {
    acc[log.severity] = (acc[log.severity] || 0) + 1;
    return acc;
  }, {});
  return { total: logs.length, bySeverity, recent: logs.slice(-50) };
}

function resetForTests() {
  logs.length = 0;
}

module.exports = { query, resetForTests, snapshot, write };
