const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminNotificationController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../validators/schemas");

const previewSchema = z.object({
  subject: z.string().max(250).optional(),
  htmlBody: z.string().max(20000).optional(),
  textBody: z.string().max(20000).optional(),
  payload: z.record(z.any()).optional(),
});

const templateSchema = z.object({
  channel: z.enum(["email", "in_app"]).optional(),
  subject: z.string().max(250),
  htmlBody: z.string().max(20000).optional(),
  textBody: z.string().max(20000).optional(),
  variables: z.array(z.string().regex(/^[a-zA-Z0-9_]+$/)).max(50).optional(),
  enabled: z.boolean().optional(),
});

router.use(requireAuth, requireRole("admin", "support"));

router.get("/providers", c.getProviders);
router.get("/templates", c.getTemplates);
router.post("/templates/preview", validate(previewSchema), c.previewTemplate);
router.put("/templates/:key", requireRole("admin"), validate(templateSchema), c.updateTemplate);

module.exports = router;
