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
const checkoutFoundationSchema = z.object({
  currency: z.enum(["USD", "PKR", "EUR", "GBP"]).optional(),
  couponCode: z.string().max(50).optional(),
  billingDetails: z.object({
    name: z.string().max(150).optional(),
    email: z.string().email().optional(),
    company: z.string().max(150).optional(),
    country: z.string().max(80).optional(),
    state: z.string().max(80).optional(),
    city: z.string().max(80).optional(),
    postalCode: z.string().max(30).optional(),
    addressLine1: z.string().max(200).optional(),
    addressLine2: z.string().max(200).optional(),
    taxId: z.string().max(80).optional(),
  }).optional(),
  items: z.array(z.object({
    productId: objectIdSchema,
    planId: objectIdSchema,
    quantity: z.number().int().positive().optional(),
    purchasedVersion: z.string().max(80).optional(),
  })).min(1).max(20),
});

router.post("/checkout", validate(checkoutSchema), c.createCheckout);
router.post("/checkout/session", validate(checkoutFoundationSchema), c.createCheckoutFoundation);
router.get("/",          c.getMyOrders);
router.post("/:id/retry-payment", validateRequest({ params: idParamSchema }), c.retryPayment);
router.get("/:id",       validateRequest({ params: idParamSchema }), c.getMyOrder);

module.exports = router;
