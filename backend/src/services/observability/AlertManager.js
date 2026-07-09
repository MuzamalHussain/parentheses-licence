const crypto = require("crypto");
const { writeAuditLog } = require("../../utils/auditLog");

const alerts = new Map();
const suppressed = new Set();

const defaultRules = [
  { id: "api_error_rate", severity: "critical", metric: "api.errorRate", threshold: 0.05, comparator: "gte", message: "API error rate is above 5%" },
  { id: "api_latency", severity: "high", metric: "api.averageResponseTimeMs", threshold: 1000, comparator: "gte", message: "Average API latency is above 1000ms" },
  { id: "queue_failed", severity: "medium", metric: "queue.failed", threshold: 1, comparator: "gte", message: "Failed queue jobs detected" },
  { id: "cache_hit_ratio", severity: "low", metric: "cache.hitRatio", threshold: 0.2, comparator: "lte", message: "Cache hit ratio is below 20%" },
];

function readPath(object, path) {
  return String(path).split(".").reduce((value, part) => value?.[part], object);
}

function compare(value, threshold, comparator) {
  if (comparator === "lte") return Number(value || 0) <= threshold;
  if (comparator === "gt") return Number(value || 0) > threshold;
  if (comparator === "lt") return Number(value || 0) < threshold;
  return Number(value || 0) >= threshold;
}

function trigger(rule, value, { actor = null, ip = "", requestId = "" } = {}) {
  const existing = Array.from(alerts.values()).find((alert) => alert.ruleId === rule.id && alert.status === "open");
  if (existing || suppressed.has(rule.id)) return existing || null;
  const alert = {
    id: crypto.randomUUID(),
    ruleId: rule.id,
    severity: rule.severity,
    message: rule.message,
    value,
    threshold: rule.threshold,
    status: "open",
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
  };
  alerts.set(alert.id, alert);
  writeAuditLog({ actor, action: "observability.alert_triggered", targetType: "Alert", targetId: alert.id, metadata: alert, ip, requestId });
  return alert;
}

function evaluate(metrics, context = {}) {
  const triggered = [];
  defaultRules.forEach((rule) => {
    const value = readPath(metrics, rule.metric);
    if (compare(value, rule.threshold, rule.comparator)) {
      const alert = trigger(rule, value, context);
      if (alert) triggered.push(alert);
    }
  });
  return triggered;
}

function acknowledge(id, { actor = null, ip = "", requestId = "" } = {}) {
  const alert = alerts.get(id);
  if (!alert) return null;
  alert.status = "acknowledged";
  alert.acknowledgedAt = new Date().toISOString();
  writeAuditLog({ actor, action: "observability.alert_acknowledged", targetType: "Alert", targetId: id, metadata: alert, ip, requestId });
  return alert;
}

function suppress(ruleId) {
  suppressed.add(ruleId);
  return { ruleId, suppressed: true };
}

function list() {
  return Array.from(alerts.values());
}

function snapshot() {
  const all = list();
  return {
    total: all.length,
    open: all.filter((alert) => alert.status === "open").length,
    acknowledged: all.filter((alert) => alert.status === "acknowledged").length,
    rules: defaultRules.map((rule) => ({ ...rule, suppressed: suppressed.has(rule.id) })),
    alerts: all.slice(-50),
    escalationFoundation: true,
  };
}

function resetForTests() {
  alerts.clear();
  suppressed.clear();
}

module.exports = { acknowledge, evaluate, list, resetForTests, snapshot, suppress, trigger };
