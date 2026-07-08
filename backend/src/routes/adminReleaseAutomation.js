const express = require("express");
const router = express.Router();
const c = require("../controllers/adminReleaseAutomationController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.dashboard);
router.post("/repositories", c.connectRepository);
router.post("/repositories/:id/health", c.checkRepositoryHealth);
router.post("/repositories/:id/import", c.importRelease);
router.post("/pipelines/:id/validate", c.validatePipeline);
router.patch("/pipelines/:id/status", c.updatePipelineStatus);

module.exports = router;
