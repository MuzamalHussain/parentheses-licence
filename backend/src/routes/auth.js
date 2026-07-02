const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } = require("../validators/schemas");
const { makeRateLimiter } = require("../middleware/apiSecurity");

const authLimiter = makeRateLimiter("auth");

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.get("/me", requireAuth, authController.getMe);

module.exports = router;
