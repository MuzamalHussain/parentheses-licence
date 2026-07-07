const express = require("express");
const router = express.Router();
const c = require("../controllers/adminOrderController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");
const { z } = require("zod");
const { validate } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/stats",                c.getOrderStats);
router.get("/",                     c.getOrders);
router.get("/:id",                  validateRequest({ params: idParamSchema }), c.getOrder);
router.post("/:id/status",          requireRole("admin"), validateRequest({ params: idParamSchema }), validate(z.object({ status: z.enum(["draft", "pending", "processing", "completed", "cancelled", "failed", "refunded"]), reason: z.string().max(500).optional() })), c.changeStatus);
router.post("/:id/complete",        requireRole("admin"), validateRequest({ params: idParamSchema }), c.completeOrder);
router.post("/:id/cancel",          requireRole("admin"), validateRequest({ params: idParamSchema }), c.cancelOrder);
router.post("/:id/mark-refunded",   requireRole("admin"), validateRequest({ params: idParamSchema }), c.markRefunded);

module.exports = router;
