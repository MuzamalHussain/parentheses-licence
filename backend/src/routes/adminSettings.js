const express = require("express");
const { z } = require("zod");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../validators/schemas");
const c = require("../controllers/adminSettingsController");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

const settingValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.any())]),
});

const secretValueSchema = z.object({
  value: z.string().min(1),
});

router.get("/", c.getSettings);
router.get("/feature-flags", c.getFeatureFlags);
router.patch("/:key", validate(settingValueSchema), c.updateSetting);
router.patch("/:key/secret", validate(secretValueSchema), c.updateSecretSetting);

module.exports = router;
