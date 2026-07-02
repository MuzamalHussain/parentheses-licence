const express = require("express");
const router = express.Router();
const c = require("../controllers/adminLicenseController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

// Validation schemas inline
const createLicenseSchema = z.object({
  userId:               z.string().min(1),
  productId:            z.string().min(1),
  planId:               z.string().min(1),
  expiresAt:            z.string().datetime().optional().nullable(),
  allowedSitesOverride: z.number().int().min(0).optional(),
  notes:                z.string().max(1000).optional(),
});

const updateLicenseSchema = z.object({
  expiresAt:    z.string().datetime().optional().nullable(),
  allowedSites: z.number().int().min(0).optional(),
  notes:        z.string().max(1000).optional(),
});

router.get("/stats", c.getLicenseStats);
router.get("/",      c.getLicenses);
router.get("/:id",   validateRequest({ params: idParamSchema }), c.getLicense);

router.post("/",     requireRole("admin"), validate(createLicenseSchema), c.createLicense);
router.patch("/:id", requireRole("admin"), validateRequest({ params: idParamSchema }), validate(updateLicenseSchema), c.updateLicense);

router.post("/:id/suspend",           requireRole("admin"), validateRequest({ params: idParamSchema }), c.suspendLicense);
router.post("/:id/reinstate",         requireRole("admin"), validateRequest({ params: idParamSchema }), c.reinstateLicense);
router.post("/:id/revoke",            requireRole("admin"), validateRequest({ params: idParamSchema }), c.revokeLicense);
router.post("/:id/reset-activations", requireRole("admin"), validateRequest({ params: idParamSchema }), c.resetActivations);

module.exports = router;
