const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminInfrastructureController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/health", controller.health);
router.get("/queue", controller.queue);
router.get("/capacity", controller.capacity);

module.exports = router;
