const express = require("express");
const router = express.Router();
const c = require("../controllers/supportTicketController");
const { requireAuth } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, idParamSchema, objectIdSchema } = require("../validators/schemas");

router.use(requireAuth);

const createTicketSchema = z.object({
  subject:   z.string().min(3).max(200),
  message:   z.string().min(1).max(5000),
  licenseId: objectIdSchema.optional().nullable(),
});

const replySchema = z.object({
  message: z.string().min(1).max(5000),
});

router.get("/tickets",            c.getMyTickets);
router.get("/tickets/:id",        validateRequest({ params: idParamSchema }), c.getMyTicket);
router.post("/tickets",           validate(createTicketSchema), c.createTicket);
router.post("/tickets/:id/reply", validateRequest({ params: idParamSchema }), validate(replySchema), c.replyToTicket);

module.exports = router;
