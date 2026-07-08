const express = require("express");
const router = express.Router();
const c = require("../controllers/adminComplianceController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.dashboard);
router.patch("/policy", c.updatePolicy);
router.post("/exports", c.requestExport);
router.post("/legal-holds", c.createLegalHold);
router.post("/legal-holds/:holdId/release", c.releaseLegalHold);
router.post("/users/:userId/anonymize", c.anonymizeUser);
router.get("/reports/:type", c.report);

module.exports = router;
