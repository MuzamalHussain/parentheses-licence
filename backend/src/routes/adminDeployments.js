const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminDeploymentController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const environmentEnum = z.enum(["local", "development", "testing", "staging", "production"]);

const deploymentSchema = z.object({
  version: z.string().trim().min(1).max(120),
  previousVersion: z.string().trim().max(120).optional(),
  environment: environmentEnum.default("development"),
}).passthrough();

const promotionSchema = z.object({
  from: environmentEnum.default("development"),
  to: environmentEnum.default("staging"),
  version: z.string().trim().min(1).max(120),
}).passthrough();

const approvalSchema = z.object({
  decision: z.enum(["approve", "reject"]).default("approve"),
  reason: z.string().trim().max(1000).optional(),
}).passthrough();

const rollbackSchema = z.object({
  deploymentId: z.string().trim().min(3),
  targetVersion: z.string().trim().max(120).optional(),
  rollbackType: z.enum(["application", "configuration", "release"]).default("application"),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.post("/deployments", validateRequest({ body: deploymentSchema }), controller.start);
router.post("/promote", validateRequest({ body: promotionSchema }), controller.promote);
router.post("/approvals/:id", validateRequest({ body: approvalSchema }), controller.approve);
router.get("/health", controller.health);
router.patch("/environments/:id", controller.updateEnvironment);
router.post("/rollback/validate", validateRequest({ body: rollbackSchema }), controller.rollbackValidate);

module.exports = router;
