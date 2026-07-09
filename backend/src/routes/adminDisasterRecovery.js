const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminDisasterRecoveryController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const backupSchema = z.object({
  type: z.enum(["full", "incremental", "differential", "manual"]).default("manual"),
  policyId: z.string().trim().max(100).optional(),
  targets: z.array(z.string().trim().max(100)).max(30).optional(),
}).passthrough();

const restoreSchema = z.object({
  backupId: z.string().trim().min(3),
  scope: z.enum(["entire_platform", "organization", "user", "license", "order", "configuration"]).default("entire_platform"),
  targetId: z.string().trim().max(120).optional(),
  organizationId: z.string().trim().max(120).optional(),
}).passthrough();

const scheduleSchema = z.object({
  id: z.string().trim().max(100).optional(),
  frequency: z.enum(["hourly", "daily", "weekly", "monthly", "custom"]).default("daily"),
  customSchedule: z.string().trim().max(100).optional(),
  backupType: z.enum(["full", "incremental", "differential", "manual"]).default("incremental"),
  enabled: z.boolean().optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/backups", controller.listBackups);
router.post("/backups", validateRequest({ body: backupSchema }), controller.createBackup);
router.get("/backups/:id/verify", controller.verifyBackup);
router.post("/restore/validate", validateRequest({ body: restoreSchema }), controller.planRestore);
router.post("/schedules", validateRequest({ body: scheduleSchema }), controller.configureSchedule);
router.patch("/policies/:id", controller.updatePolicy);

module.exports = router;
