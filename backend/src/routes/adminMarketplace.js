const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminMarketplaceController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const actionSchema = z.object({
  action: z.enum(["install", "enable", "disable", "update", "rollback", "uninstall", "grant-permission", "revoke-permission"]),
  id: z.string().trim().min(3).max(120),
});

const permissionBody = z.object({
  permissions: z.array(z.string().trim().max(120)).max(50).optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/catalog", controller.catalog);
router.get("/installed", controller.installed);
router.get("/sdk", controller.sdk);
router.post("/catalog", controller.addToCatalog);
router.post("/manifest/validate", controller.validateManifest);
router.post("/extensions/:id/:action", validateRequest({ params: actionSchema, body: permissionBody }), controller.lifecycle);

module.exports = router;
