const express = require("express");
const router = express.Router();
const c = require("../controllers/customerLicenseController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/summary",                  c.getMySummary);
router.get("/",                         c.getMyLicenses);
router.get("/:id",                      c.getMyLicense);
router.get("/:id/activation-history",   c.getActivationHistory);
router.post("/:id/deactivate-domain",   c.deactivateDomain);

module.exports = router;
