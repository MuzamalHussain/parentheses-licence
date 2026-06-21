const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/adminDashboardController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", requireAuth, requireRole("admin", "support"), getDashboardStats);

module.exports = router;
