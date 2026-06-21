const express = require("express");
const router = express.Router();
const c = require("../controllers/adminLicenseController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate } = require("../validators/schemas");

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
router.get("/:id",   c.getLicense);

router.post("/",     requireRole("admin"), validate(createLicenseSchema), c.createLicense);
router.patch("/:id", requireRole("admin"), validate(updateLicenseSchema), c.updateLicense);

router.post("/:id/suspend",           requireRole("admin"), c.suspendLicense);
router.post("/:id/reinstate",         requireRole("admin"), c.reinstateLicense);
router.post("/:id/revoke",            requireRole("admin"), c.revokeLicense);
router.post("/:id/reset-activations", requireRole("admin"), c.resetActivations);

module.exports = router;
