const crypto = require("crypto");

const traces = new Map();
const MAX_TRACES = 300;

function createTrace({ requestId = "", userId = "", organizationId = "", module = "api", endpoint = "" } = {}) {
  const traceId = crypto.randomUUID();
  traces.set(traceId, {
    traceId,
    requestId,
    userId,
    organizationId,
    module,
    endpoint,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: null,
    status: "running",
    spans: [],
  });
  if (traces.size > MAX_TRACES) traces.delete(traces.keys().next().value);
  return traceId;
}

function startSpan(traceId, name, metadata = {}) {
  const trace = traces.get(traceId);
  if (!trace) return null;
  const span = { id: crypto.randomUUID(), name, metadata, startedAt: Date.now(), endedAt: null, durationMs: null, status: "running" };
  trace.spans.push(span);
  return span.id;
}

function endSpan(traceId, spanId, status = "ok", metadata = {}) {
  const trace = traces.get(traceId);
  const span = trace?.spans.find((item) => item.id === spanId);
  if (!span) return null;
  span.endedAt = Date.now();
  span.durationMs = span.endedAt - span.startedAt;
  span.status = status;
  span.metadata = { ...span.metadata, ...metadata };
  return span;
}

function endTrace(traceId, status = "ok", metadata = {}) {
  const trace = traces.get(traceId);
  if (!trace) return null;
  trace.endedAt = Date.now();
  trace.durationMs = trace.endedAt - trace.startedAt;
  trace.status = status;
  trace.metadata = metadata;
  return trace;
}

function middleware(req, res, next) {
  const incomingTrace = req.get("x-trace-id");
  const traceId = incomingTrace && incomingTrace.length <= 128
    ? incomingTrace
    : createTrace({ requestId: req.id, module: "api", endpoint: req.originalUrl?.split("?")[0] || req.path });
  if (!traces.has(traceId)) {
    traces.set(traceId, {
      traceId,
      requestId: req.id,
      module: "api",
      endpoint: req.originalUrl?.split("?")[0] || req.path,
      startedAt: Date.now(),
      spans: [],
      status: "running",
    });
  }
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);
  const spanId = startSpan(traceId, "api.request", { method: req.method, endpoint: req.originalUrl?.split("?")[0] || req.path });
  res.on("finish", () => {
    endSpan(traceId, spanId, res.statusCode >= 500 ? "error" : "ok", { statusCode: res.statusCode });
    endTrace(traceId, res.statusCode >= 500 ? "error" : "ok", { statusCode: res.statusCode });
  });
  next();
}

function query(filters = {}) {
  return Array.from(traces.values()).filter((trace) => {
    if (filters.traceId && trace.traceId !== filters.traceId) return false;
    if (filters.organizationId && String(trace.organizationId) !== String(filters.organizationId)) return false;
    if (filters.module && trace.module !== filters.module) return false;
    if (filters.status && trace.status !== filters.status) return false;
    return true;
  }).slice(-Number(filters.limit || 100));
}

function snapshot() {
  const all = Array.from(traces.values());
  return {
    total: all.length,
    running: all.filter((trace) => trace.status === "running").length,
    failed: all.filter((trace) => trace.status === "error").length,
    recent: all.slice(-50),
  };
}

function resetForTests() {
  traces.clear();
}

module.exports = { createTrace, endSpan, endTrace, middleware, query, resetForTests, snapshot, startSpan };
