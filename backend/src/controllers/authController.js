const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { AppError } = require("../utils/errorHandler");
const notificationService = require("../services/notificationService");
const { getConfig } = require("../config/env");
const { writeAuditLog } = require("../utils/auditLog");
const { logWarn } = require("../utils/logger");
const { getSessionClient } = require("../utils/sessionSecurity");
const EnterpriseIdentityService = require("../services/identity/EnterpriseIdentityService");

// Helper — hash a plain token for safe DB storage
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("InvalidPassword123", 12);

function parseDurationMs(value, fallbackMs) {
  const match = String(value || "").trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

function refreshCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: true,
    secure: config.app.isProduction,
    sameSite: "strict",
    maxAge: parseDurationMs(config.auth.refreshExpires, 7 * 24 * 60 * 60 * 1000),
  };
}

function clearRefreshCookie(res) {
  const options = refreshCookieOptions();
  res.clearCookie("refreshToken", {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  });
}

function isLoginLocked(user) {
  return Boolean(user.loginLockedUntil && new Date(user.loginLockedUntil) > new Date());
}

function auditAuthEvent(req, action, user = null, metadata = {}) {
  writeAuditLog({
    actor: user,
    action,
    targetType: user ? "User" : "",
    targetId: user?._id || null,
    metadata,
    ip: req?.ip || "",
    requestId: req?.id || "",
  }).catch(() => {});
}

async function registerFailedLogin(user, email, req = null) {
  if (!user) {
    await bcrypt.compare("invalid-password", DUMMY_PASSWORD_HASH);
    logWarn("auth.login_failed", { email, reason: "invalid_credentials" });
    await auditAuthEvent(req, "auth.login_failed", null, { reason: "invalid_credentials", email });
    return;
  }

  const config = getConfig();
  const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  const wasLocked = isLoginLocked(user);
  user.failedLoginAttempts = failedLoginAttempts;

  if (failedLoginAttempts >= config.auth.maxFailedLoginAttempts) {
    user.loginLockedUntil = new Date(Date.now() + config.auth.loginLockoutMinutes * 60 * 1000);
    logWarn("auth.login_locked", { userId: user._id, failedLoginAttempts });
  } else {
    logWarn("auth.login_failed", { userId: user._id, reason: "invalid_credentials", failedLoginAttempts });
  }

  await user.save({ validateBeforeSave: false });
  await auditAuthEvent(req, "auth.login_failed", user, {
    reason: "invalid_credentials",
    failedLoginAttempts,
    locked: Boolean(user.loginLockedUntil),
    ipAddress: req?.ip || "",
  });
  if (!wasLocked && user.loginLockedUntil) {
    await auditAuthEvent(req, "auth.account_locked", user, {
      failedLoginAttempts,
      loginLockedUntil: user.loginLockedUntil,
      ipAddress: req?.ip || "",
    });
  }
}

function pruneRefreshSessions(user) {
  const now = Date.now();
  const maxSessions = getConfig().auth.maxRefreshSessions;
  user.refreshSessions = (user.refreshSessions || [])
    .filter((session) => session.expiresAt && new Date(session.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.lastUsedAt || b.createdAt) - new Date(a.lastUsedAt || a.createdAt))
    .slice(0, maxSessions);
}

function issueRefreshSession(user, payload, existingSessionId = null, req = null) {
  const sessionId = existingSessionId || crypto.randomBytes(24).toString("hex");
  const refreshToken = signRefreshToken({ ...payload, nonce: crypto.randomBytes(16).toString("hex") }, { jwtid: sessionId });
  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);
  const client = req ? getSessionClient(req) : {};
  const session = {
    sessionId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    createdAt: existingSessionId ? undefined : new Date(),
    loginAt: existingSessionId ? undefined : new Date(),
    lastUsedAt: new Date(),
    ...client,
  };

  pruneRefreshSessions(user);
  const sessions = user.refreshSessions || [];
  const existingIndex = sessions.findIndex((item) => item.sessionId === sessionId);
  if (existingIndex >= 0) {
    sessions[existingIndex].tokenHash = session.tokenHash;
    sessions[existingIndex].expiresAt = session.expiresAt;
    sessions[existingIndex].lastUsedAt = session.lastUsedAt;
    if (client.userAgent) sessions[existingIndex].userAgent = client.userAgent;
    if (client.browser) sessions[existingIndex].browser = client.browser;
    if (client.operatingSystem) sessions[existingIndex].operatingSystem = client.operatingSystem;
    if (client.device) sessions[existingIndex].device = client.device;
    if (client.ipAddress) sessions[existingIndex].ipAddress = client.ipAddress;
  } else {
    sessions.unshift(session);
  }
  user.refreshSessions = sessions.slice(0, getConfig().auth.maxRefreshSessions);

  return refreshToken;
}

function revokeRefreshSession(user, sessionId) {
  user.refreshSessions = (user.refreshSessions || []).filter((session) => session.sessionId !== sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, companyName } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError("An account with this email already exists.", 409);

  const passwordPolicy = await EnterpriseIdentityService.resolvePolicy(null);
  const passwordCheck = EnterpriseIdentityService.validatePassword(password, passwordPolicy.password);
  if (!passwordCheck.valid) throw new AppError(passwordCheck.errors[0], 422);
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
    passwordChangedAt: new Date(),
    emailVerificationToken: hashedToken,
    emailVerificationExpires: expires,
  });

  const verifyUrl = `${getConfig().app.clientOrigins[0]}/verify-email?token=${rawToken}`;
  await notificationService.sendVerificationEmail({ to: email, name, url: verifyUrl });
  await auditAuthEvent(req, "auth.registered", user, { emailVerificationSent: true });

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

  const user = await User.findOne({ email }).select("+passwordHash +failedLoginAttempts +loginLockedUntil +refreshSessions");
  if (user && isLoginLocked(user)) {
    await auditAuthEvent(req, "auth.login_blocked_locked", user, {
      loginLockedUntil: user.loginLockedUntil,
      ipAddress: req.ip || "",
    });
    throw new AppError("Too many failed login attempts. Please try again later.", 423);
  }

  if (!user || !(await user.comparePassword(password))) {
    await registerFailedLogin(user, email, req);
    throw new AppError("Invalid email or password.", 401);
  }
  if (!user.isActive) throw new AppError("Your account has been deactivated. Contact support.", 403);
  if (user.isSuspended) throw new AppError("Your account has been suspended. Contact support.", 403);
  const identityPolicy = await EnterpriseIdentityService.resolvePolicy(user.activeOrganizationId);
  EnterpriseIdentityService.enforcePolicyForLogin(user, identityPolicy);

  const wasPreviouslyLocked = Boolean(user.loginLockedUntil);
  user.lastLoginAt = new Date();
  user.failedLoginAttempts = 0;
  user.loginLockedUntil = undefined;

  const payload = { id: user._id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = issueRefreshSession(user, payload, null, req);
  await user.save({ validateBeforeSave: false });
  if (wasPreviouslyLocked) await auditAuthEvent(req, "auth.account_unlocked", user, { reason: "successful_login" });
  await auditAuthEvent(req, "auth.login", user, {
    sessionCount: user.refreshSessions?.length || 0,
    sessionId: user.refreshSessions?.[0]?.sessionId || "",
    ...getSessionClient(req),
    mfaRequired: Boolean(identityPolicy.mfa.required && !user.twoFactorEnabled),
  });

  res
    .cookie("refreshToken", refreshToken, refreshCookieOptions())
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
  if (!decoded.jti) throw new AppError("Invalid refresh token.", 401);

  const user = await User.findById(decoded.id).select("+refreshSessions");
  if (!user || !user.isActive || user.isSuspended) throw new AppError("User not found or inactive.", 401);

  pruneRefreshSessions(user);
  const session = (user.refreshSessions || []).find((item) => item.sessionId === decoded.jti);
  const identityPolicy = await EnterpriseIdentityService.resolvePolicy(user.activeOrganizationId);
  if (!session || new Date(session.expiresAt) <= new Date()) {
    clearRefreshCookie(res);
    if (user) await user.save({ validateBeforeSave: false });
    await auditAuthEvent(req, "auth.refresh_rejected", user, {
      sessionId: decoded.jti,
      reason: session ? "expired_session" : "missing_session",
      ...getSessionClient(req),
    });
    throw new AppError("Refresh token is invalid or has expired.", 401);
  }
  if (!EnterpriseIdentityService.sessionPolicyAllows(session, identityPolicy)) {
    revokeRefreshSession(user, decoded.jti);
    await user.save({ validateBeforeSave: false });
    clearRefreshCookie(res);
    await auditAuthEvent(req, "auth.refresh_rejected", user, {
      sessionId: decoded.jti,
      reason: "security_policy_timeout",
      ...getSessionClient(req),
    });
    throw new AppError("Session expired by organization security policy.", 401);
  }

  if (session.tokenHash !== hashToken(token)) {
    revokeRefreshSession(user, decoded.jti);
    await user.save({ validateBeforeSave: false });
    clearRefreshCookie(res);
    logWarn("auth.refresh_token_replay_rejected", { userId: user._id, sessionId: decoded.jti });
    await auditAuthEvent(req, "auth.refresh_reuse_rejected", user, { sessionId: decoded.jti, ...getSessionClient(req) });
    throw new AppError("Refresh token is invalid or has expired.", 401);
  }

  const payload = { id: user._id, role: user.role };
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = issueRefreshSession(user, payload, decoded.jti, req);
  await user.save({ validateBeforeSave: false });
  await auditAuthEvent(req, "auth.refresh_rotated", user, { sessionId: decoded.jti, ...getSessionClient(req) });

  res
    .cookie("refreshToken", newRefreshToken, refreshCookieOptions())
    .json({
      success: true,
      data: { accessToken: newAccessToken },
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  let auditUser = null;
  let auditSessionId = "";
  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      if (decoded?.id && decoded?.jti) {
        const user = await User.findById(decoded.id).select("+refreshSessions");
        if (user) {
          auditUser = user;
          auditSessionId = decoded.jti;
          revokeRefreshSession(user, decoded.jti);
          await user.save({ validateBeforeSave: false });
        }
      }
    } catch {
      // Logout should be idempotent even if the cookie is expired or malformed.
    }
  }

  clearRefreshCookie(res);
  await auditAuthEvent(req, "auth.logout", auditUser, { sessionId: auditSessionId });
  res.json({ success: true, message: "Logged out." });
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
  await auditAuthEvent(req, "auth.email_verified", user);

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

  const resetUrl = `${getConfig().app.clientOrigins[0]}/reset-password?token=${rawToken}`;
  await notificationService.sendPasswordResetEmail({ to: user.email, name: user.name, url: resetUrl });
  await auditAuthEvent(req, "auth.password_reset_requested", user);

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
  }).select("+passwordResetToken +passwordResetExpires +refreshSessions +passwordHistory");

  if (!user) throw new AppError("Reset token is invalid or has expired.", 400);
  const identityPolicy = await EnterpriseIdentityService.resolvePolicy(user.activeOrganizationId);
  const passwordCheck = EnterpriseIdentityService.validatePassword(password, identityPolicy.password, user.passwordHistory || []);
  if (!passwordCheck.valid) throw new AppError(passwordCheck.errors[0], 422);

  const previousHash = user.passwordHash;
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  user.passwordHistory = [previousHash, ...(user.passwordHistory || [])].filter(Boolean).slice(0, identityPolicy.password.historyCount || 0);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshSessions = [];
  await user.save({ validateBeforeSave: false });
  await auditAuthEvent(req, "auth.password_reset_completed", user);

  res.json({ success: true, message: "Password reset successfully. You can now log in." });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me   (protected)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toSafeJSON() });
});
