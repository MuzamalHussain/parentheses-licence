const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminWorkflowController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");

const dispatchSchema = z.object({
  eventName: z.string().min(2).max(100),
  payload: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

router.use(requireAuth, requireRole("admin"));

router.get("/overview", c.getOverview);
router.get("/jobs", c.listJobs);
router.post("/events", validateRequest({ body: dispatchSchema }), c.dispatchEvent);
router.post("/jobs/:id/retry", validateRequest({ params: idParamSchema }), c.retryJob);
router.post("/jobs/:id/cancel", validateRequest({ params: idParamSchema }), c.cancelJob);

module.exports = router;
