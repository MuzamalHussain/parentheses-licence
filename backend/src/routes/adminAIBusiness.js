const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIBusinessController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", controller.dashboard);
router.get("/history", controller.history);
router.post("/query", controller.query);

module.exports = router;
