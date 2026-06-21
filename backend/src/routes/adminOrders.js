const express = require("express");
const router = express.Router();
const c = require("../controllers/adminOrderController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/stats",                c.getOrderStats);
router.get("/",                     c.getOrders);
router.get("/:id",                  c.getOrder);
router.post("/:id/mark-refunded",   requireRole("admin"), c.markRefunded);

module.exports = router;
