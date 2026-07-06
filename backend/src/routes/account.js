const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");
const { requireAuth } = require("../middleware/auth");
const { validate, validateRequest, profileUpdateSchema, changePasswordSchema, sessionIdParamSchema } = require("../validators/schemas");

router.use(requireAuth);

router.get("/profile", accountController.getProfile);
router.patch("/profile", validate(profileUpdateSchema), accountController.updateProfile);
router.post("/change-password", validate(changePasswordSchema), accountController.changePassword);
router.get("/sessions", accountController.getSessions);
router.get("/security-events", accountController.getSecurityEvents);
router.delete("/sessions/current", accountController.revokeCurrentSession);
router.delete("/sessions/others", accountController.revokeOtherSessions);
router.delete("/sessions/all", accountController.revokeAllSessions);
router.delete("/sessions/:sessionId", validateRequest({ params: sessionIdParamSchema }), accountController.revokeSession);

module.exports = router;
