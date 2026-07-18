const express = require("express");
const { z } = require("zod");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate, validateRequest } = require("../validators/schemas");
const c = require("../controllers/adminSettingsController");
const general = require("../controllers/generalSettingsController");
const email = require("../controllers/emailCenterController");
const payments = require("../controllers/paymentCenterController");
const aiProviders = require("../controllers/aiProvidersCenterController");
const storageCenter = require("../controllers/storageCenterController");
const securityCenter = require("../controllers/securityCenterController");
const featureFlags = require("../controllers/featureFlagController");
const { imageUpload } = require("../middleware/generalSettingsUpload");

const router = express.Router();

router.get("/general/assets/:filename", general.getGeneralAsset);
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
router.get("/general", general.getGeneralSettings);
router.get("/email", email.get);
router.get("/payments",payments.get);router.patch("/payments/:provider",payments.patch);router.patch("/payments/:provider/secrets/:key",payments.secret);router.post("/payments/:provider/test",payments.test);router.get("/payments-health",payments.health);router.get("/payments-status",payments.status);
router.get("/ai-providers",aiProviders.get);router.patch("/ai-providers/:id",aiProviders.patch);router.patch("/ai-providers/:id/secrets/:key",aiProviders.secret);router.post("/ai-providers/:id/test",aiProviders.test);router.get("/ai-providers-health",aiProviders.health);router.get("/ai-providers-capabilities",aiProviders.capabilities);router.get("/ai-providers-status",aiProviders.status);
router.get("/storage-center",storageCenter.get);router.patch("/storage-center/:id",storageCenter.patch);router.patch("/storage-center/:id/secrets/:key",storageCenter.secret);router.post("/storage-center/:id/test",storageCenter.test);router.get("/storage-health",storageCenter.health);router.get("/storage-status",storageCenter.status);router.get("/storage-categories",storageCenter.categories);router.patch("/storage-categories",storageCenter.updateCategories);
router.get("/security-center",securityCenter.get);router.patch("/security-center",securityCenter.patch);router.get("/security-health",securityCenter.health);router.get("/security-policies",securityCenter.policies);router.post("/security-force-logout",securityCenter.forceLogout);
router.patch("/email", validateRequest({ body: z.object({ settings: z.record(z.union([z.string(), z.number(), z.boolean()])) }) }), email.patch);
router.patch("/email/password", validateRequest({ body: z.union([z.object({ value: z.string().min(1).max(500) }), z.object({ clear: z.literal(true) })]) }), email.password);
router.post("/email/test-connection", email.test);
router.post("/email/send-test", validateRequest({ body: z.object({ to: z.string().email() }) }), email.send);
router.get("/email/health", email.health);
router.get("/email/logs", email.logs);
router.patch("/general", validateRequest({ body: z.object({ settings: z.record(z.union([z.string(), z.number(), z.boolean()])).refine((value) => Object.keys(value).length > 0) }) }), general.updateGeneralSettings);
router.post("/general/logo", imageUpload("logo"), general.uploadGeneralAsset("logo"));
router.post("/general/favicon", imageUpload("favicon"), general.uploadGeneralAsset("favicon"));
router.get("/feature-flags", featureFlags.list);router.patch("/feature-flags/:key", featureFlags.patch);router.post("/feature-flags/:key/enable", featureFlags.enable);router.post("/feature-flags/:key/disable", featureFlags.disable);router.post("/feature-flags/:key/evaluate", featureFlags.evaluate);router.post("/feature-flags/bulk", featureFlags.bulk);router.get("/maintenance-status", featureFlags.maintenance);router.patch("/maintenance-status", featureFlags.updateMaintenance);
router.get("/payment-providers", c.getPaymentProviders);
router.patch("/:key", validateRequest({ params: settingKeyParamSchema }), validate(settingValueSchema), c.updateSetting);
router.patch("/:key/secret", validateRequest({ params: settingKeyParamSchema }), validate(secretValueSchema), c.updateSecretSetting);

module.exports = router;
