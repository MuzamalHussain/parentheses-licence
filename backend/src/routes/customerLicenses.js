const express = require("express");
const router = express.Router();
const c = require("../controllers/customerLicenseController");
const { requireAuth } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth);

router.get("/summary",                  c.getMySummary);
router.get("/",                         c.getMyLicenses);
router.get("/:id",                      validateRequest({ params: idParamSchema }), c.getMyLicense);
router.get("/:id/activation-history",   validateRequest({ params: idParamSchema }), c.getActivationHistory);
router.post("/:id/deactivate-domain",   validateRequest({ params: idParamSchema }), c.deactivateDomain);

module.exports = router;
