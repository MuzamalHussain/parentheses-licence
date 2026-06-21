const express = require("express");
const router = express.Router();
const c = require("../controllers/adminDomainController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

router.get("/stats",                          c.getDomainStats);
router.get("/",                               c.getDomains);
router.get("/:licenseId/history",             c.getDomainHistory);
router.post("/:licenseId/force-deactivate",   requireRole("admin"), validate(domainSchema), c.forceDeactivateDomain);

module.exports = router;
