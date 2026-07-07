const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminOperationsController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const actionParamSchema = z.object({
  action: z.enum(["set-maintenance", "clear-cache", "restart-jobs", "rebuild-analytics"]),
});

const actionBodySchema = z.object({
  maintenanceMode: z.boolean().optional(),
  readOnlyMode: z.boolean().optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", c.getDashboard);
router.post("/maintenance/:action", validateRequest({ params: actionParamSchema, body: actionBodySchema }), c.runMaintenanceAction);

module.exports = router;
