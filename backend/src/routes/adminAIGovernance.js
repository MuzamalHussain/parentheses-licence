const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminAIGovernanceController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", controller.dashboard);
router.get("/route", controller.routeProvider);
router.get("/model-health", controller.modelHealth);
router.post("/policy", controller.savePolicy);
router.post("/policy/enforce", controller.enforcePolicy);
router.post("/prompts", controller.submitPrompt);
router.post("/prompts/transition", controller.transitionPrompt);
router.post("/prompts/rollback", controller.rollbackPrompt);
router.post("/models/transition", controller.modelTransition);
router.post("/models/version", controller.modelVersion);

module.exports = router;
