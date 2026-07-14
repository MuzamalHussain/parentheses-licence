const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminIntegrationController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest } = require("../validators/schemas");

const providerParamSchema = z.object({
  providerId: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]+$/).max(80),
});

const configureSchema = z.object({
  configuration: z.record(z.any()).optional(),
});

const enabledSchema = z.object({ enabled: z.boolean() });

router.use(requireAuth, requireRole("admin"));

router.get("/", c.getIntegrations);
router.get("/api-capabilities", c.getApiCapabilities);
router.post("/:providerId/configure", validateRequest({ params: providerParamSchema, body: configureSchema }), c.configureIntegration);
router.post("/:providerId/enabled", validateRequest({ params: providerParamSchema, body: enabledSchema }), c.setEnabled);
router.post("/:providerId/test", validateRequest({ params: providerParamSchema }), c.testConnection);

module.exports = router;
