const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { verifyRefreshToken } = require("../utils/jwt");
const { AppError } = require("../utils/errorHandler");
const { writeAuditLog } = require("../utils/auditLog");

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

function getCurrentRefreshSessionId(req, userId) {
  const token = req.cookies?.refreshToken;
  if (!token) return null;

  try {
    const decoded = verifyRefreshToken(token);
    if (decoded?.id?.toString() !== userId.toString()) return null;
    return decoded.jti || null;
  } catch {
    return null;
  }
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
