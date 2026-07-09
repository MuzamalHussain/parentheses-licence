const express = require("express");
const router = express.Router();
const { getHealth, getSystemDiagnostics } = require("../services/diagnosticsService");
const { getMetricsSnapshot } = require("../services/metricsService");
const HealthRegistry = require("../services/infrastructure/HealthRegistry");

router.get("/health", async (req, res, next) => {
  try {
    const health = await getHealth({ readiness: false });
    res.json({
      ...health,
      env: req.app.get("env"),
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/live", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    message: "API process is alive.",
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

router.get("/ready", async (req, res, next) => {
  try {
    const readiness = await getHealth({ readiness: true });
    res.status(readiness.success ? 200 : 503).json({
      ...readiness,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/metrics", async (req, res, next) => {
  try {
    const diagnostics = await getSystemDiagnostics({ verifySmtp: false });
    res.status(diagnostics.status === "ok" ? 200 : 503).json({
      success: diagnostics.status === "ok",
      status: diagnostics.status,
      metrics: getMetricsSnapshot(),
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/health/platform", async (req, res, next) => {
  try {
    const health = await HealthRegistry.snapshot();
    res.status(health.status === "down" ? 503 : 200).json({
      success: health.status !== "down",
      status: health.status,
      services: health.services,
      generatedAt: health.generatedAt,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
