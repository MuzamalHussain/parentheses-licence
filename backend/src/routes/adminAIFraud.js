const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIFraudController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", controller.dashboard);
router.get("/history", controller.history);

module.exports = router;
