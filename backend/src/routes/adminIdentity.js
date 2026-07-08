const express = require("express");
const router = express.Router();
const c = require("../controllers/adminIdentityController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.overview);
router.patch("/policy", c.updatePolicy);
router.post("/providers", c.saveProvider);
router.patch("/providers/:providerId/status", c.setProviderStatus);
router.post("/providers/:providerId/test", c.testProvider);
router.delete("/sessions/:userId/:sessionId", c.revokeSession);

module.exports = router;
