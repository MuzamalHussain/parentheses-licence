const express = require("express");
const router = express.Router();
const c = require("../controllers/adminPaymentController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/", c.getPayments);
router.get("/webhooks", c.getWebhookLogs);
router.post("/webhooks/:id/retry", requireRole("admin"), validateRequest({ params: idParamSchema }), c.retryWebhook);

module.exports = router;
