const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIReleaseController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/history", controller.history);
router.post("/analyze", controller.analyze);

module.exports = router;
