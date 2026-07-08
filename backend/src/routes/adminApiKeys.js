const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminApiKeyController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");
const { API_KEY_SCOPES } = require("../models/ApiKey");

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  ownerId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  environment: z.enum(["production", "sandbox"]).optional(),
  accessType: z.enum(["read_only", "full_access"]).optional(),
  keyType: z.enum(["production", "sandbox", "temporary"]).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).optional(),
  expiresAt: z.coerce.date().optional(),
});

router.use(requireAuth, requireRole("admin"));

router.get("/", c.listApiKeys);
router.post("/", validateRequest({ body: createKeySchema }), c.createApiKey);
router.post("/:id/rotate", validateRequest({ params: idParamSchema }), c.rotateApiKey);
router.post("/:id/revoke", validateRequest({ params: idParamSchema }), c.revokeApiKey);

module.exports = router;
