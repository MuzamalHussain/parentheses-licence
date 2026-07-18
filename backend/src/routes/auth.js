const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } = require("../validators/schemas");
const RuntimeSecurity = require("../middleware/runtimeSecurity");

router.post("/register", RuntimeSecurity.rate("registration"), validate(registerSchema), authController.register);
router.post("/login", RuntimeSecurity.rate("login"), validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verification", RuntimeSecurity.rate("verificationEmail"), validate(forgotPasswordSchema), authController.resendVerification);
router.post("/forgot-password", RuntimeSecurity.rate("passwordReset"), validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", RuntimeSecurity.rate("passwordReset"), validate(resetPasswordSchema), authController.resetPassword);
router.get("/me", requireAuth, authController.getMe);

module.exports = router;
