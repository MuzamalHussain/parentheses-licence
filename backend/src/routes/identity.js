const express = require("express");
const router = express.Router();
const c = require("../controllers/identityController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.post("/mfa/start", c.startMfa);
router.post("/mfa/verify", c.verifyMfa);
router.post("/mfa/disable", c.disableMfa);

module.exports = router;
