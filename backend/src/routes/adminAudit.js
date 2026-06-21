const express = require("express");
const router = express.Router();
const { getAuditLogs } = require("../controllers/adminAuditController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", requireAuth, requireRole("admin"), getAuditLogs);

module.exports = router;
