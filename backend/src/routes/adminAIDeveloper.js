const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIDeveloperController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", controller.dashboard);
router.get("/prompts", controller.prompts);
router.get("/history", controller.history);
router.post("/ask", controller.ask);

module.exports = router;
