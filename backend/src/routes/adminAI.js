const express = require("express");
const router = express.Router();
const c = require("../controllers/adminAIController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.overview);
router.post("/providers", c.saveProvider);
router.post("/providers/:providerId/health", c.healthCheck);
router.post("/models", c.registerModel);
router.post("/prompts", c.savePrompt);
router.post("/usage/track", c.trackUsage);

module.exports = router;
