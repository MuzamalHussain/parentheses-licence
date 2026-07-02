const express = require("express");
const router = express.Router();
const c = require("../controllers/orderController");
const { requireAuth } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, idParamSchema, objectIdSchema } = require("../validators/schemas");

router.use(requireAuth);

const checkoutSchema = z.object({
  productId:  objectIdSchema,
  planId:     objectIdSchema,
  gateway:    z.enum(["stripe", "local"]),
  couponCode: z.string().max(50).optional(),
});

router.post("/checkout", validate(checkoutSchema), c.createCheckout);
router.get("/",          c.getMyOrders);
router.get("/:id",       validateRequest({ params: idParamSchema }), c.getMyOrder);

module.exports = router;
