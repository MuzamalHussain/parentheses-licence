const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/adminWebhookController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");
const { WEBHOOK_EVENTS } = require("../models/WebhookEndpoint");

const webhookBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  targetUrl: z.string().trim().max(2000),
  secret: z.string().min(16).max(200).optional(),
  enabled: z.boolean().optional(),
  subscribedEvents: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
}).strict();

const updateWebhookSchema = webhookBodySchema.partial();

const deliveryQuerySchema = z.object({
  eventName: z.enum(WEBHOOK_EVENTS).optional(),
  status: z.enum(["pending", "queued", "delivering", "sent", "failed", "retrying", "dead_letter", "disabled", "skipped"]).optional(),
  endpointUrl: z.string().max(300).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
}).passthrough();

const retryQueueSchema = z.object({ limit: z.number().int().positive().max(100).optional() }).optional();

router.use(requireAuth, requireRole("admin"));

router.get("/", validateRequest({ query: deliveryQuerySchema }), c.getOverview);
router.post("/", validateRequest({ body: webhookBodySchema }), c.createWebhook);
router.patch("/:id", validateRequest({ params: idParamSchema, body: updateWebhookSchema }), c.updateWebhook);
router.delete("/:id", validateRequest({ params: idParamSchema }), c.deleteWebhook);
router.post("/deliveries/:id/retry", validateRequest({ params: idParamSchema }), c.retryDelivery);
router.post("/retry-queue/process", validateRequest({ body: retryQueueSchema }), c.processRetryQueue);

module.exports = router;
