const express = require("express"); const { requireAuth, requireRole } = require("../middleware/auth"); const c = require("../controllers/adminDiagnosticsController");
const router = express.Router(); router.use(requireAuth, requireRole("admin"));
router.get("/", c.getDiagnostics); router.get("/system-health", c.systemHealth); router.get("/providers", c.providerHealth); router.get("/metrics", c.metrics); router.get("/history", c.history); router.post("/run", c.run);
module.exports = router;
