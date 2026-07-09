const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminObservabilityController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const incidentBodySchema = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  affectedServices: z.array(z.string().trim().max(80)).max(20).optional(),
  metadata: z.record(z.any()).optional(),
}).passthrough();

const resolveBodySchema = z.object({
  notes: z.string().trim().max(1000).optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/metrics", controller.metrics);
router.get("/logs", controller.logs);
router.get("/traces", controller.traces);
router.get("/incidents", controller.incidents);
router.post("/incidents", validateRequest({ body: incidentBodySchema }), controller.createIncident);
router.post("/incidents/:id/resolve", validateRequest({ body: resolveBodySchema }), controller.resolveIncident);
router.get("/alerts", controller.alerts);
router.post("/alerts/:id/acknowledge", controller.acknowledgeAlert);
router.get("/slo", controller.slo);

module.exports = router;
