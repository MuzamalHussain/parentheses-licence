const express = require("express");
const { z } = require("zod");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate, validateRequest } = require("../validators/schemas");
const c = require("../controllers/adminSettingsController");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

const settingValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.any())]),
});

const secretValueSchema = z.object({
  value: z.string().min(1),
});
const settingKeyParamSchema = z.object({
  key: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.:-]+$/, "Invalid setting key."),
});

router.get("/", c.getSettings);
router.get("/feature-flags", c.getFeatureFlags);
router.get("/payment-providers", c.getPaymentProviders);
router.patch("/:key", validateRequest({ params: settingKeyParamSchema }), validate(settingValueSchema), c.updateSetting);
router.patch("/:key/secret", validateRequest({ params: settingKeyParamSchema }), validate(secretValueSchema), c.updateSecretSetting);

module.exports = router;
