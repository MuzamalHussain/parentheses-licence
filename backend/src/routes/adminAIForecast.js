const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIForecastController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/history", controller.history);
router.post("/generate", controller.generate);

module.exports = router;
