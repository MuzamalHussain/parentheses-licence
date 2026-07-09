const express = require("express");
const router = express.Router();
const c = require("../controllers/aiAssistantController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/conversations", c.history);
router.post("/ask", c.ask);

module.exports = router;
