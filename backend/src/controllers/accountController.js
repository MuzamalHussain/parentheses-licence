const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { AppError } = require("../utils/errorHandler");
const { writeAuditLog } = require("../utils/auditLog");
const { activeSerializedSessions, getCurrentRefreshSessionId } = require("../utils/sessionSecurity");
const { getConfig } = require("../config/env");

function auditAccountEvent(req, action, user, metadata = {}) {
  return writeAuditLog({
    actor: user,
    action,
    targetType: "User",
    targetId: user?._id || null,
    metadata,
    ip: req.ip || "",
    requestId: req.id || "",
  }).catch(() => {});
}

exports.getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toSafeJSON() });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const allowedUpdates = {};
  for (const field of ["name", "companyName"]) {
    if (req.body[field] !== undefined) allowedUpdates[field] = req.body[field];
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User no longer exists.", 401);

  const changedFields = [];
  for (const [field, value] of Object.entries(allowedUpdates)) {
    if (user[field] !== value) changedFields.push(field);
    user[field] = value;
  }

  await user.save();
  await auditAccountEvent(req, "account.profile_updated", user, { changedFields });

  res.json({
    success: true,
    message: "Profile updated.",
    data: user.toSafeJSON(),
  });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+passwordHash +refreshSessions");
  if (!user) throw new AppError("User no longer exists.", 401);

  const passwordMatches = await user.comparePassword(currentPassword);
  if (!passwordMatches) throw new AppError("Current password is incorrect.", 401);

  const currentSessionId = getCurrentRefreshSessionId(req, user._id);
  const previousSessionCount = user.refreshSessions?.length || 0;

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.refreshSessions = currentSessionId
    ? (user.refreshSessions || []).filter((session) => session.sessionId === currentSessionId)
    : [];

  await user.save({ validateBeforeSave: false });
  await auditAccountEvent(req, "account.password_changed", user, {
    retainedCurrentSession: Boolean(currentSessionId),
    revokedSessions: Math.max(0, previousSessionCount - (user.refreshSessions?.length || 0)),
  });

  res.json({
    success: true,
    message: "Password changed successfully.",
  });
});

function clearRefreshCookie(res) {
  const config = getConfig();
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: config.app.isProduction,
    sameSite: "strict",
  });
}

function securityEventFilter(userId) {
  return {
    $or: [
      { actorId: userId },
      { targetType: "User", targetId: userId },
    ],
  };
}

exports.getSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshSessions");
  if (!user) throw new AppError("User no longer exists.", 401);
  const currentSessionId = getCurrentRefreshSessionId(req, user._id);
  res.json({ success: true, data: activeSerializedSessions(user, currentSessionId) });
});

exports.getSecurityEvents = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const loginActions = ["auth.login", "auth.login_failed", "auth.logout", "auth.refresh_rotated", "auth.login_blocked_locked"];
  const securityActions = [
    "auth.login",
    "auth.login_failed",
    "auth.logout",
    "auth.refresh_rotated",
    "auth.refresh_rejected",
    "auth.refresh_reuse_rejected",
    "auth.account_locked",
    "auth.account_unlocked",
    "auth.email_verified",
    "auth.password_reset_completed",
    "account.password_changed",
    "account.profile_updated",
    "account.session_revoked",
    "account.sessions_revoked",
    "admin.user.sessions_revoked",
    "admin.user.password_reset_forced",
    "admin.user.suspend",
    "admin.user.deactivate",
  ];

  const [loginHistory, securityEvents] = await Promise.all([
    AuditLog.find({ ...securityEventFilter(userId), action: { $in: loginActions } })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    AuditLog.find({ ...securityEventFilter(userId), action: { $in: securityActions } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("actorId", "name email role")
      .lean(),
  ]);

  res.json({ success: true, data: { loginHistory, securityEvents } });
});

exports.revokeSession = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshSessions");
  if (!user) throw new AppError("User no longer exists.", 401);
  const currentSessionId = getCurrentRefreshSessionId(req, user._id);
  const before = user.refreshSessions?.length || 0;
  user.refreshSessions = (user.refreshSessions || []).filter((session) => session.sessionId !== req.params.sessionId);
  const revoked = before - (user.refreshSessions?.length || 0);
  await user.save({ validateBeforeSave: false });
  if (currentSessionId === req.params.sessionId) clearRefreshCookie(res);
  await auditAccountEvent(req, "account.session_revoked", user, {
    sessionId: req.params.sessionId,
    currentSession: currentSessionId === req.params.sessionId,
    revoked,
  });
  res.json({ success: true, message: "Session terminated.", data: { revoked } });
});

exports.revokeCurrentSession = asyncHandler(async (req, res) => {
  const currentSessionId = getCurrentRefreshSessionId(req, req.user._id);
  if (!currentSessionId) throw new AppError("Current session could not be identified.", 400);
  req.params.sessionId = currentSessionId;
  return exports.revokeSession(req, res);
});

exports.revokeOtherSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshSessions");
  if (!user) throw new AppError("User no longer exists.", 401);
  const currentSessionId = getCurrentRefreshSessionId(req, user._id);
  const before = user.refreshSessions?.length || 0;
  user.refreshSessions = currentSessionId
    ? (user.refreshSessions || []).filter((session) => session.sessionId === currentSessionId)
    : [];
  const revoked = before - (user.refreshSessions?.length || 0);
  await user.save({ validateBeforeSave: false });
  await auditAccountEvent(req, "account.sessions_revoked", user, { scope: "other", revoked });
  res.json({ success: true, message: "Other sessions terminated.", data: { revoked } });
});

exports.revokeAllSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshSessions");
  if (!user) throw new AppError("User no longer exists.", 401);
  const revoked = user.refreshSessions?.length || 0;
  user.refreshSessions = [];
  await user.save({ validateBeforeSave: false });
  clearRefreshCookie(res);
  await auditAccountEvent(req, "account.sessions_revoked", user, { scope: "all", revoked });
  res.json({ success: true, message: "All sessions terminated.", data: { revoked } });
});
