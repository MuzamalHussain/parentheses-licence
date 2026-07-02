const express = require("express");
const controller = require("../controllers/wpUpdaterController");
const { activationRateLimiter } = require("../middleware/rateLimiter");

const router = express.Router();
const checkLimiter = activationRateLimiter({ maxPerIp: 60, maxPerKey: 30, windowMs: 60_000 });

router.post("/check", checkLimiter, controller.check);
router.get("/download/:token", controller.download);

module.exports = router;
