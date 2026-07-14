const express = require("express");
const router = express.Router();
const adminUserController = require("../controllers/adminUserController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const {
  validate,
  validateRequest,
  idParamSchema,
  sessionIdParamSchema,
  customerDetailQuerySchema,
  adminUserProfileUpdateSchema,
  adminUserStatusSchema,
  adminUserEmailVerificationSchema,
  adminUserInternalNoteSchema,
} = require("../validators/schemas");

router.use(requireAuth, requireRole("admin"));

const roleSchema = z.object({ role: z.enum(["customer", "admin", "support"]) });

router.get("/", adminUserController.getUsers);
router.get("/:id/overview",  validateRequest({ params: idParamSchema }), adminUserController.getCustomerOverview);
router.get("/:id/licenses",  validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerLicenses);
router.get("/:id/orders",    validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerOrders);
router.get("/:id/downloads", validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerDownloads);
router.get("/:id/domains",   validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerDomains);
router.get("/:id/support",   validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerSupport);
router.get("/:id/audit",     validateRequest({ params: idParamSchema, query: customerDetailQuerySchema }), adminUserController.getCustomerAudit);
router.get("/:id/security",  validateRequest({ params: idParamSchema }), adminUserController.getCustomerSecurity);
router.get("/:id", validateRequest({ params: idParamSchema }), adminUserController.getUser);
router.patch("/:id/profile", validateRequest({ params: idParamSchema, body: adminUserProfileUpdateSchema }), adminUserController.updateCustomerProfile);
router.patch("/:id/status", validateRequest({ params: idParamSchema, body: adminUserStatusSchema }), adminUserController.updateCustomerStatus);
router.patch("/:id/email-verification", validateRequest({ params: idParamSchema, body: adminUserEmailVerificationSchema }), adminUserController.updateCustomerEmailVerification);
router.post("/:id/resend-verification", validateRequest({ params: idParamSchema }), adminUserController.resendCustomerVerification);
router.post("/:id/force-password-reset", validateRequest({ params: idParamSchema }), adminUserController.forceCustomerPasswordReset);
router.post("/:id/send-password-reset", validateRequest({ params: idParamSchema }), adminUserController.sendCustomerPasswordReset);
router.post("/:id/revoke-sessions", validateRequest({ params: idParamSchema }), adminUserController.revokeCustomerSessions);
router.delete("/:id/sessions/:sessionId", validateRequest({ params: idParamSchema.merge(sessionIdParamSchema) }), adminUserController.revokeCustomerSession);
router.post("/:id/notes", validateRequest({ params: idParamSchema, body: adminUserInternalNoteSchema }), adminUserController.addCustomerInternalNote);
router.patch("/:id/role", validateRequest({ params: idParamSchema }), validate(roleSchema), adminUserController.updateRole);
router.patch("/:id/toggle-active", validateRequest({ params: idParamSchema }), adminUserController.toggleActive);

module.exports = router;
