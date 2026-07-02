const express = require("express");
const router = express.Router();
const c = require("../controllers/adminDomainController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, licenseIdParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

router.get("/stats",                          c.getDomainStats);
router.get("/",                               c.getDomains);
router.get("/:licenseId/history",             validateRequest({ params: licenseIdParamSchema }), c.getDomainHistory);
router.post("/:licenseId/force-deactivate",   requireRole("admin"), validateRequest({ params: licenseIdParamSchema }), validate(domainSchema), c.forceDeactivateDomain);

module.exports = router;
