const express = require("express");
const router = express.Router();
const c = require("../controllers/complianceController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/consent", c.consentHistory);
router.post("/consent", c.recordConsent);

module.exports = router;
