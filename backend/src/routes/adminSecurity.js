const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminSecurityController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const policySchema = z.object({
  status: z.enum(["enabled", "disabled", "monitor"]).optional(),
  maxRiskScore: z.number().int().min(0).max(100).optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/policies", controller.policies);
router.patch("/policies/:scope", validateRequest({ body: policySchema }), controller.updatePolicy);
router.get("/runtime", controller.runtime);
router.get("/secrets", controller.secretHealth);
router.get("/dependencies", controller.dependencyHealth);
router.post("/evaluate", controller.evaluate);
router.post("/sessions/:sessionId/revoke", controller.revokeSession);

module.exports = router;
