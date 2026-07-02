const express = require("express");
const router = express.Router();
const c = require("../controllers/adminOrderController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/stats",                c.getOrderStats);
router.get("/",                     c.getOrders);
router.get("/:id",                  validateRequest({ params: idParamSchema }), c.getOrder);
router.post("/:id/mark-refunded",   requireRole("admin"), validateRequest({ params: idParamSchema }), c.markRefunded);

module.exports = router;
