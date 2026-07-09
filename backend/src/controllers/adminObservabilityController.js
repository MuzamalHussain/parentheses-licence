const asyncHandler = require("express-async-handler");
const Observability = require("../services/observability/ObservabilityManager");
const Metrics = require("../services/observability/MetricsCollector");
const Logs = require("../services/observability/StructuredLogger");
const Traces = require("../services/observability/TraceManager");
const Incidents = require("../services/observability/IncidentManager");
const Alerts = require("../services/observability/AlertManager");
const Slo = require("../services/observability/SloService");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Observability.dashboard(), requestId: req.id });
});

exports.metrics = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Metrics.platformMetrics(), requestId: req.id });
});

exports.logs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Logs.query(req.query), requestId: req.id });
});

exports.traces = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Traces.query(req.query), requestId: req.id });
});

exports.incidents = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Incidents.list(req.query), requestId: req.id });
});

exports.createIncident = asyncHandler(async (req, res) => {
  const data = Incidents.create({
    title: req.body.title,
    severity: req.body.severity,
    affectedServices: req.body.affectedServices || [],
    metadata: req.body.metadata || {},
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(201).json({ success: true, data, requestId: req.id });
});

exports.resolveIncident = asyncHandler(async (req, res) => {
  const data = Incidents.resolve(req.params.id, {
    notes: req.body?.notes || "",
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: Boolean(data), data, requestId: req.id });
});

exports.alerts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Alerts.snapshot(), requestId: req.id });
});

exports.acknowledgeAlert = asyncHandler(async (req, res) => {
  const data = Alerts.acknowledge(req.params.id, { actor: req.user, ip: req.ip, requestId: req.id });
  res.json({ success: Boolean(data), data, requestId: req.id });
});

exports.slo = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Slo.snapshot(), requestId: req.id });
});
