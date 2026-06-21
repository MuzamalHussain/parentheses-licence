const express = require("express");
const router = express.Router();
const plugin = require("../controllers/pluginActivationController");
const { activationRateLimiter } = require("../middleware/rateLimiter");

// These endpoints are called directly by the WordPress plugin — no JWT auth,
// the licenseKey itself is the credential. Protected instead by rate limiting
// (per-IP and per-licenseKey) to deter brute-force / scraping.

const limiter = activationRateLimiter({ maxPerIp: 30, maxPerKey: 10, windowMs: 60_000 });
// `check` is hit far more often (periodic polling) — looser limit.
const checkLimiter = activationRateLimiter({ maxPerIp: 60, maxPerKey: 30, windowMs: 60_000 });

router.post("/activate",        limiter,      plugin.activate);
router.post("/deactivate",      limiter,      plugin.deactivate);
router.post("/check",           checkLimiter, plugin.check);
router.post("/replace-domain",  limiter,      plugin.replaceDomain);
router.post("/update-check",    checkLimiter, plugin.updateCheck);

module.exports = router;
