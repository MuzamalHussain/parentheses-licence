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
  status:               z.enum(["draft", "pending", "active", "suspended", "expired", "revoked", "cancelled", "trial", "lifetime"]).optional(),
  licenseType:          z.enum(["single_site", "3_sites", "5_sites", "10_sites", "unlimited", "developer", "agency", "custom"]).optional(),
  entitlements:         z.object({
    downloads: z.boolean().optional(),
    updates: z.boolean().optional(),
    activations: z.boolean().optional(),
    betaChannel: z.boolean().optional(),
    prioritySupport: z.boolean().optional(),
    lifetimeUpdates: z.boolean().optional(),
    lifetimeSupport: z.boolean().optional(),
  }).optional(),
  notes:                z.string().max(1000).optional(),
});

const updateLicenseSchema = z.object({
  expiresAt:    z.string().datetime().optional().nullable(),
  allowedSites: z.number().int().min(0).optional(),
  status:       z.enum(["draft", "pending", "active", "suspended", "expired", "revoked", "cancelled", "trial", "lifetime"]).optional(),
  licenseType:  z.enum(["single_site", "3_sites", "5_sites", "10_sites", "unlimited", "developer", "agency", "custom"]).optional(),
  allowedReleaseChannels: z.array(z.enum(["stable", "release_candidate", "beta", "alpha", "internal"])).optional(),
  entitlements: z.object({
    downloads: z.boolean().optional(),
    updates: z.boolean().optional(),
    activations: z.boolean().optional(),
    betaChannel: z.boolean().optional(),
    prioritySupport: z.boolean().optional(),
    lifetimeUpdates: z.boolean().optional(),
    lifetimeSupport: z.boolean().optional(),
  }).optional(),
  downloadLimits: z.object({
    perLicense: z.number().int().min(0).optional(),
    perVersion: z.number().int().min(0).optional(),
    perDay: z.number().int().min(0).optional(),
  }).optional(),
  renewal: z.object({
    eligible: z.boolean().optional(),
    autoRenew: z.boolean().optional(),
    gracePeriodDays: z.number().int().min(0).optional(),
    renewalWindowDays: z.number().int().min(0).optional(),
    nextRenewalAt: z.string().datetime().optional().nullable(),
  }).optional(),
  subscription: z.object({
    status: z.enum(["none", "trialing", "active", "past_due", "paused", "cancelled", "expired", "manual"]).optional(),
    startedAt: z.string().datetime().optional().nullable(),
    renewalDate: z.string().datetime().optional().nullable(),
    nextBillingAt: z.string().datetime().optional().nullable(),
    cancelledAt: z.string().datetime().optional().nullable(),
    pausedAt: z.string().datetime().optional().nullable(),
    autoRenew: z.boolean().optional(),
    manualRenewal: z.boolean().optional(),
    provider: z.string().max(80).optional(),
    externalSubscriptionId: z.string().max(150).optional(),
  }).optional(),
  notes:        z.string().max(1000).optional(),
});

const lifecycleActionSchema = z.object({
  reason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  days: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  allowEarly: z.boolean().optional(),
}).passthrough();
const transferSchema = z.object({ toUserId: z.string().min(1), note: z.string().max(500).optional() });
const changePlanSchema = z.object({ toPlanId: z.string().min(1), changeType: z.enum(["upgrade", "downgrade", "transfer_plan"]).optional(), reason: z.string().max(500).optional(), note: z.string().max(500).optional() });
const domainActionSchema = z.object({ domain: z.string().min(1).max(255) });
const siteActionSchema = z.object({
  domain: z.string().min(1).max(255),
  action: z.enum(["deactivate", "force_deactivate", "rename", "suspend", "whitelist", "blacklist"]),
  siteName: z.string().max(150).optional(),
});
const subscriptionActionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel", "expire", "enable_auto_renew", "disable_auto_renew"]),
  reason: z.string().max(500).optional(),
});

router.get("/stats", c.getLicenseStats);
router.get("/",      c.getLicenses);
router.get("/:id",   validateRequest({ params: idParamSchema }), c.getLicense);
router.get("/:id/sites", validateRequest({ params: idParamSchema }), c.getLicenseSites);

router.post("/",     requireRole("admin"), validate(createLicenseSchema), c.createLicense);
router.patch("/:id", requireRole("admin"), validateRequest({ params: idParamSchema }), validate(updateLicenseSchema), c.updateLicense);

router.post("/:id/suspend",           requireRole("admin"), validateRequest({ params: idParamSchema }), c.suspendLicense);
router.post("/:id/reinstate",         requireRole("admin"), validateRequest({ params: idParamSchema }), c.reinstateLicense);
router.post("/:id/revoke",            requireRole("admin"), validateRequest({ params: idParamSchema }), c.revokeLicense);
router.post("/:id/reset-activations", requireRole("admin"), validateRequest({ params: idParamSchema }), c.resetActivations);
router.post("/:id/activate",          requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.activateLicense);
router.post("/:id/expire",            requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.expireLicense);
router.post("/:id/cancel",            requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.cancelLicense);
router.post("/:id/extend-expiration", requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.extendExpiration);
router.post("/:id/convert-trial",     requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.convertTrial);
router.post("/:id/convert-lifetime",  requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.convertLifetime);
router.post("/:id/renew",             requireRole("admin"), validateRequest({ params: idParamSchema }), validate(lifecycleActionSchema), c.renewLicense);
router.post("/:id/transfer",          requireRole("admin"), validateRequest({ params: idParamSchema }), validate(transferSchema), c.transferLicense);
router.post("/:id/change-plan",       requireRole("admin"), validateRequest({ params: idParamSchema }), validate(changePlanSchema), c.changePlan);
router.post("/:id/subscription",      requireRole("admin"), validateRequest({ params: idParamSchema }), validate(subscriptionActionSchema), c.subscriptionAction);
router.post("/:id/manual-activate",   requireRole("admin"), validateRequest({ params: idParamSchema }), validate(domainActionSchema), c.manualActivate);
router.post("/:id/force-deactivate",  requireRole("admin"), validateRequest({ params: idParamSchema }), validate(domainActionSchema), c.forceDeactivate);
router.post("/:id/site-action",       requireRole("admin"), validateRequest({ params: idParamSchema }), validate(siteActionSchema), c.siteAction);

module.exports = router;
