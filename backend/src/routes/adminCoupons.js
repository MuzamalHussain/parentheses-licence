const express = require("express");
const router = express.Router();
const c = require("../controllers/adminCouponController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

const createCouponSchema = z.object({
  code:      z.string().min(2).max(50),
  type:      z.enum(["percentage", "fixed"]),
  value:     z.number().min(0),
  maxUses:   z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const updateCouponSchema = z.object({
  value:     z.number().min(0).optional(),
  maxUses:   z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive:  z.boolean().optional(),
});

router.get("/",          c.getCoupons);
router.post("/",         requireRole("admin"), validate(createCouponSchema), c.createCoupon);
router.post("/validate", c.validateCoupon);
router.get("/:id",       validateRequest({ params: idParamSchema }), c.getCoupon);
router.patch("/:id",     requireRole("admin"), validateRequest({ params: idParamSchema }), validate(updateCouponSchema), c.updateCoupon);
router.delete("/:id",    requireRole("admin"), validateRequest({ params: idParamSchema }), c.deactivateCoupon);

module.exports = router;
