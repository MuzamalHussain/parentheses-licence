const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAICommandController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", controller.dashboard);
router.post("/command", controller.command);

module.exports = router;
