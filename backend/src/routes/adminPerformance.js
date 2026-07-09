const express = require("express");
const { z } = require("zod");
const router = express.Router();
const controller = require("../controllers/adminPerformanceController");
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/operationsAuth");
const { validateRequest } = require("../validators/schemas");

const cacheInvalidateSchema = z.object({
  group: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().max(80)).max(20).optional(),
}).passthrough();

const cacheWarmSchema = z.object({
  targets: z.array(z.string().trim().max(80)).max(20).optional(),
}).passthrough();

router.use(requireAuth, requireSuperAdmin);

router.get("/dashboard", controller.dashboard);
router.get("/cache", controller.cache);
router.get("/profiler", controller.profiler);
router.get("/queries", controller.queries);
router.post("/cache/invalidate", validateRequest({ body: cacheInvalidateSchema }), controller.invalidateCache);
router.post("/cache/warm", validateRequest({ body: cacheWarmSchema }), controller.warmCache);

module.exports = router;
