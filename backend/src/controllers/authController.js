const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { AppError } = require("../utils/errorHandler");
const { sendEmail, emailTemplates } = require("../utils/email");
const { getConfig } = require("../config/env");

// Helper — hash a plain token for safe DB storage
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, companyName } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError("An account with this email already exists.", 409);

  const passwordHash = await bcrypt.hash(password, 12);

  // Email verification token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const user = await User.create({
    name,
    email,
    passwordHash,
    companyName: companyName || "",
    emailVerificationToken: hashedToken,
    emailVerificationExpires: expires,
  });

  // Send verification email (non-blocking — don't fail registration if email fails)
  try {
    const verifyUrl = `${getConfig().app.clientOrigins[0]}/verify-email?token=${rawToken}`;
    const tmpl = emailTemplates.verifyEmail(name, verifyUrl);
    await sendEmail({ to: email, ...tmpl });
  } catch (err) {
    console.error("[Auth] Verification email failed:", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Account created. Please check your email to verify your account.",
    data: user.toSafeJSON(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password.", 401);
  }
  if (!user.isActive) throw new AppError("Your account has been deactivated. Contact support.", 403);

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const payload = { id: user._id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: getConfig().app.isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    .json({
      success: true,
      message: "Logged in successfully.",
      data: { user: user.toSafeJSON(), accessToken },
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new AppError("No refresh token provided.", 401);

  const decoded = verifyRefreshToken(token);
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) throw new AppError("User not found or inactive.", 401);

  const payload = { id: user._id, role: user.role };
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  res
    .cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: getConfig().app.isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      success: true,
      data: { accessToken: newAccessToken },
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken").json({ success: true, message: "Logged out." });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/verify-email?token=xxx
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw new AppError("Verification token is missing.", 400);

  const hashed = hashToken(token);
  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpires: { $gt: Date.now() },
  }).select("+emailVerificationToken +emailVerificationExpires");

  if (!user) throw new AppError("Token is invalid or has expired.", 400);

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: "Email verified successfully. You can now log in." });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Always respond OK — don't leak whether email exists
  if (!user) {
    return res.json({
      success: true,
      message: "If an account exists with that email, a reset link has been sent.",
    });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  try {
    const resetUrl = `${getConfig().app.clientOrigins[0]}/reset-password?token=${rawToken}`;
    const tmpl = emailTemplates.passwordReset(user.name, resetUrl);
    await sendEmail({ to: user.email, ...tmpl });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw new AppError("Failed to send reset email. Try again later.", 500);
  }

  res.json({
    success: true,
    message: "If an account exists with that email, a reset link has been sent.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const hashed = hashToken(token);
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: Date.now() },
  }).select("+passwordResetToken +passwordResetExpires");

  if (!user) throw new AppError("Reset token is invalid or has expired.", 400);

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: "Password reset successfully. You can now log in." });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me   (protected)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toSafeJSON() });
});
