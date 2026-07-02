const express = require("express");
const router = express.Router();
const { getDiagnostics } = require("../controllers/adminDiagnosticsController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", requireAuth, requireRole("admin", "support"), getDiagnostics);

module.exports = router;
