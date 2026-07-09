const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIWorkflowController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", controller.dashboard);
router.post("/plan", controller.plan);
router.post("/policies", controller.updatePolicy);
router.post("/approvals/:id/approve", controller.approve);
router.post("/approvals/:id/reject", controller.reject);
router.post("/approvals/:id/execute", controller.execute);

module.exports = router;
