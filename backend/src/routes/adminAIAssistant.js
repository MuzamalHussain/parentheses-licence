const express = require("express");
const router = express.Router();
const c = require("../controllers/adminAIAssistantController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/conversations", c.history);
router.get("/stats", c.stats);
router.post("/ask", c.ask);

module.exports = router;
