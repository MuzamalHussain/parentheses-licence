const express = require("express");
const router = express.Router();
const c = require("../controllers/adminSupportController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

const replySchema = z.object({ message: z.string().min(1).max(5000) });
const statusSchema = z.object({ status: z.enum(["open", "pending", "closed"]) });

router.get("/tickets/stats",         c.getTicketStats);
router.get("/tickets",               c.getTickets);
router.get("/tickets/:id",           c.getTicket);
router.post("/tickets/:id/reply",    validate(replySchema), c.replyToTicket);
router.patch("/tickets/:id/status",  validate(statusSchema), c.updateStatus);

module.exports = router;
