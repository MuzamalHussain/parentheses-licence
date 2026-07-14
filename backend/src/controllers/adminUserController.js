const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const License = require("../models/License");
const Order = require("../models/Order");
const Download = require("../models/Download");
const SupportTicket = require("../models/SupportTicket");
const AuditLog = require("../models/AuditLog");
const { AppError } = require("../utils/errorHandler");
const { ROLES } = require("../utils/constants");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { writeAuditLog } = require("../utils/auditLog");
const notificationService = require("../services/notificationService");
const { getConfig } = require("../config/env");
const { activeSerializedSessions } = require("../utils/sessionSecurity");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function toObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

function safeUser(user) {
  const internalNotes = user.internalNotes
    ? [...user.internalNotes]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((note) => ({
        id: note._id,
        body: note.body,
        createdAt: note.createdAt,
        createdBy: note.createdBy
          ? {
            id: note.createdBy._id || note.createdBy.id || note.createdBy,
            name: note.createdBy.name || "",
            email: note.createdBy.email || "",
            role: note.createdBy.role || "",
          }
          : null,
      }))
    : undefined;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: user.companyName,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt || null,
    emailVerificationSource: user.emailVerificationSource || null,
    emailVerificationLastSentAt: user.emailVerificationLastSentAt || null,
    emailVerificationLastStatus: user.emailVerificationLastStatus || null,
    twoFactorEnabled: user.twoFactorEnabled,
    isActive: user.isActive,
    isSuspended: Boolean(user.isSuspended),
    accountStatus: user.isSuspended ? "suspended" : user.isActive ? "active" : "inactive",
    suspendedAt: user.suspendedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(internalNotes ? { internalNotes } : {}),
  };
}

async function getCustomerOrThrow(id) {
  const [user, notesDocument] = await Promise.all([
    User.findById(id).lean(),
    User.findById(id).select("+internalNotes +emailVerificationLastSentAt +emailVerificationLastStatus").lean(),
  ]);
  if (!user) throw new AppError("User not found.", 404);
  user.internalNotes = notesDocument?.internalNotes || [];
  user.emailVerificationLastSentAt = notesDocument?.emailVerificationLastSentAt || null;
  user.emailVerificationLastStatus = notesDocument?.emailVerificationLastStatus || null;
  return User.populate(user, { path: "internalNotes.createdBy", select: "name email role" });
}

async function getMutableUserOrThrow(id, select = "") {
  const user = await User.findById(id).select(select);
  if (!user) throw new AppError("User not found.", 404);
  return user;
}

function preventSelfAction(req, action) {
  if (req.params.id === req.user._id.toString()) {
    throw new AppError(`Cannot ${action} your own account.`, 403);
  }
}

function auditAdminUserEvent(req, action, targetUser, metadata = {}) {
  return writeAuditLog({
    actor: req.user,
    action,
    targetType: "User",
    targetId: targetUser._id,
    metadata,
    ip: req.ip || "",
    requestId: req.id || "",
  });
}

async function issuePasswordReset(user) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  const resetUrl = `${getConfig().app.clientOrigins[0]}/reset-password?token=${rawToken}`;
  const notification = await notificationService.sendPasswordResetEmail({ to: user.email, name: user.name, url: resetUrl });
  return { resetUrl, notification };
}

function statusCountMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    acc.total += row.count;
    return acc;
  }, { total: 0 });
}

function auditTimelineFilter(userObjectId, licenseIds = [], orderIds = [], ticketIds = []) {
  const targets = [{ targetType: "User", targetId: userObjectId }];
  if (licenseIds.length) targets.push({ targetType: "License", targetId: { $in: licenseIds } });
  if (orderIds.length) targets.push({ targetType: "Order", targetId: { $in: orderIds } });
  if (ticketIds.length) targets.push({ targetType: "SupportTicket", targetId: { $in: ticketIds } });

  return {
    $or: [
      { actorId: userObjectId },
      ...targets,
    ],
  };
}

// GET /api/v1/admin/users
exports.getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name email role companyName emailVerified twoFactorEnabled isActive createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: users.map((u) => ({ ...u, id: u._id })),
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/admin/users/:id
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  res.json({ success: true, data: user.toSafeJSON() });
});

// GET /api/v1/admin/users/:id/overview
exports.getCustomerOverview = asyncHandler(async (req, res) => {
  const customer = await getCustomerOrThrow(req.params.id);
  const userObjectId = toObjectId(req.params.id);

  const [
    licenseStatusCounts,
    orderStatusCounts,
    downloadCount,
    supportStatusCounts,
    activeDomainTotals,
    auditCount,
  ] = await Promise.all([
    License.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 }, amountTotal: { $sum: "$amount" } } },
    ]),
    Download.countDocuments({ userId: userObjectId }),
    SupportTicket.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    License.aggregate([
      { $match: { userId: userObjectId } },
      { $project: { activeDomainCount: { $size: "$activeDomains" } } },
      { $group: { _id: null, count: { $sum: "$activeDomainCount" } } },
    ]),
    AuditLog.countDocuments({ $or: [{ actorId: userObjectId }, { targetType: "User", targetId: userObjectId }] }),
  ]);

  res.json({
    success: true,
    data: {
      customer: safeUser(customer),
      counts: {
        licenses: statusCountMap(licenseStatusCounts),
        orders: statusCountMap(orderStatusCounts),
        downloads: { total: downloadCount },
        supportTickets: statusCountMap(supportStatusCounts),
        activeDomains: { total: activeDomainTotals[0]?.count || 0 },
        auditEvents: { total: auditCount },
      },
    },
  });
});

// GET /api/v1/admin/users/:id/licenses
exports.getCustomerLicenses = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.params.id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.productId) filter.productId = req.query.productId;

  const [licenses, total] = await Promise.all([
    License.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "name slug")
      .populate("planId", "name allowedSites priceUSD priceLocal renewalType durationDays")
      .populate("orderId", "status amount currency paidAt")
      .lean({ virtuals: true }),
    License.countDocuments(filter),
  ]);

  res.json({ success: true, data: licenses, pagination: paginationMeta({ page, limit, total }) });
});

// GET /api/v1/admin/users/:id/orders
exports.getCustomerOrders = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.params.id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.gateway) filter.gateway = req.query.gateway;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("userId productId planId amount currency gateway status couponCode discountAmount licenseId paidAt failureReason expiresAt createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "name slug")
      .populate("planId", "name")
      .populate("licenseId", "licenseKey status")
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, data: orders, pagination: paginationMeta({ page, limit, total }) });
});

// GET /api/v1/admin/users/:id/downloads
exports.getCustomerDownloads = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.params.id };
  if (req.query.purpose) filter.purpose = req.query.purpose;

  const [downloads, total] = await Promise.all([
    Download.find(filter)
      .select("userId licenseId pluginVersionId expiresAt usedAt purpose domain ipAddress createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("licenseId", "licenseKey status productId")
      .populate("pluginVersionId", "versionNumber releasedAt productId")
      .lean(),
    Download.countDocuments(filter),
  ]);

  res.json({ success: true, data: downloads, pagination: paginationMeta({ page, limit, total }) });
});

// GET /api/v1/admin/users/:id/domains
exports.getCustomerDomains = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit } = getPagination(req.query);
  const userObjectId = toObjectId(req.params.id);
  const match = { userId: userObjectId, "activeDomains.0": { $exists: true } };
  if (req.query.status) match.status = req.query.status;

  const [result] = await License.aggregate([
    { $match: match },
    { $unwind: "$activeDomains" },
    { $sort: { "activeDomains.activatedAt": -1 } },
    {
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
          { $lookup: { from: "plans", localField: "planId", foreignField: "_id", as: "plan" } },
          {
            $project: {
              domain: "$activeDomains.domain",
              activatedAt: "$activeDomains.activatedAt",
              currentStatus: "$status",
              license: {
                id: "$_id",
                licenseKey: "$licenseKey",
                status: "$status",
                allowedSites: "$allowedSites",
                expiresAt: "$expiresAt",
              },
              product: { $arrayElemAt: ["$product", 0] },
              plan: { $arrayElemAt: ["$plan", 0] },
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const domains = result?.data || [];
  const total = result?.totalCount?.[0]?.count || 0;
  res.json({ success: true, data: domains, pagination: paginationMeta({ page, limit, total }) });
});

// GET /api/v1/admin/users/:id/support
exports.getCustomerSupport = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.params.id };
  if (req.query.status) filter.status = req.query.status;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("licenseId", "licenseKey status")
      .populate("assignedAgentId", "name email role")
      .populate("messages.senderId", "name email role")
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: tickets.map((ticket) => ({
      ...ticket,
      priority: ticket.priority || null,
      replyCount: Math.max(0, (ticket.messages?.length || 0) - 1),
    })),
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/admin/users/:id/audit
exports.getCustomerAudit = asyncHandler(async (req, res) => {
  await getCustomerOrThrow(req.params.id);
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 30 });
  const userObjectId = toObjectId(req.params.id);

  const [licenseIds, orderIds, ticketIds] = await Promise.all([
    License.find({ userId: req.params.id }).select("_id").lean(),
    Order.find({ userId: req.params.id }).select("_id").lean(),
    SupportTicket.find({ userId: req.params.id }).select("_id").lean(),
  ]);

  const filter = auditTimelineFilter(
    userObjectId,
    licenseIds.map((item) => item._id),
    orderIds.map((item) => item._id),
    ticketIds.map((item) => item._id)
  );
  if (req.query.action) filter.action = { $regex: req.query.action, $options: "i" };
  if (req.query.targetType) filter.targetType = req.query.targetType;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actorId", "name email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ success: true, data: logs, pagination: paginationMeta({ page, limit, total }) });
});

// PATCH /api/v1/admin/users/:id/profile
exports.updateCustomerProfile = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(req.params.id);
  const allowedFields = ["name", "companyName"];
  const changedFields = [];

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field) && user[field] !== req.body[field]) {
      user[field] = req.body[field];
      changedFields.push(field);
    }
  }

  if (changedFields.length) {
    await user.save({ validateBeforeSave: false });
    await auditAdminUserEvent(req, "admin.user.profile_updated", user, { changedFields });
  }

  res.json({ success: true, message: "Customer profile updated.", data: safeUser(user) });
});

// PATCH /api/v1/admin/users/:id/status
exports.updateCustomerStatus = asyncHandler(async (req, res) => {
  preventSelfAction(req, req.body.action);
  const user = await getMutableUserOrThrow(req.params.id, "+refreshSessions");
  const before = { isActive: user.isActive, isSuspended: Boolean(user.isSuspended) };
  let message = "Customer status updated.";

  if (req.body.action === "activate") {
    user.isActive = true;
    user.isSuspended = false;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    message = "Customer activated.";
  }
  if (req.body.action === "deactivate") {
    user.isActive = false;
    user.refreshSessions = [];
    message = "Customer deactivated and sessions revoked.";
  }
  if (req.body.action === "suspend") {
    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspendedBy = req.user._id;
    user.refreshSessions = [];
    message = "Customer suspended and sessions revoked.";
  }
  if (req.body.action === "unsuspend") {
    user.isSuspended = false;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    message = "Customer unsuspended.";
  }

  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, `admin.user.${req.body.action}`, user, {
    before,
    after: { isActive: user.isActive, isSuspended: Boolean(user.isSuspended) },
  });

  res.json({ success: true, message, data: safeUser(user) });
});

// PATCH /api/v1/admin/users/:id/email-verification
exports.updateCustomerEmailVerification = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(req.params.id, "+emailVerificationToken +emailVerificationExpires");
  const previous = Boolean(user.emailVerified);
  user.emailVerified = req.body.emailVerified;
  if (user.emailVerified) {
    user.emailVerifiedAt = new Date();
    user.emailVerificationSource = "manual_admin";
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
  } else {
    user.emailVerifiedAt = undefined;
    user.emailVerificationSource = undefined;
  }

  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, user.emailVerified ? "admin.user.email_verified" : "admin.user.email_unverified", user, {
    previous,
    emailVerified: user.emailVerified,
  });

  res.json({
    success: true,
    message: user.emailVerified ? "Email marked verified." : "Email marked unverified.",
    data: safeUser(user),
  });
});

// POST /api/v1/admin/users/:id/resend-verification
exports.resendCustomerVerification = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(
    req.params.id,
    "+emailVerificationToken +emailVerificationExpires +emailVerificationLastSentAt +emailVerificationLastStatus"
  );
  if (user.emailVerified) throw new AppError("This email address is already verified.", 409, "EMAIL_ALREADY_VERIFIED");

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.emailVerificationToken = hashToken(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  user.emailVerificationLastSentAt = new Date();
  await user.save({ validateBeforeSave: false });

  const verifyUrl = `${getConfig().app.clientOrigins[0]}/verify-email?token=${rawToken}`;
  const notification = await notificationService.sendVerificationEmail({
    to: user.email,
    name: user.name,
    url: verifyUrl,
    userId: user._id,
  });
  user.emailVerificationLastStatus = notification?.success ? "sent" : "failed";
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, notification?.success ? "admin.user.verification_resent" : "admin.user.verification_resend_failed", user);

  if (!notification?.success) {
    throw new AppError("Verification email could not be sent.", 503, "VERIFICATION_EMAIL_FAILED");
  }
  res.json({ success: true, message: "Verification email sent.", data: safeUser(user) });
});

// POST /api/v1/admin/users/:id/force-password-reset
exports.forceCustomerPasswordReset = asyncHandler(async (req, res) => {
  preventSelfAction(req, "force password reset on");
  const user = await getMutableUserOrThrow(req.params.id, "+passwordResetToken +passwordResetExpires +refreshSessions");
  const revokedSessions = user.refreshSessions?.length || 0;
  user.refreshSessions = [];
  const { notification } = await issuePasswordReset(user);
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, "admin.user.password_reset_forced", user, {
    revokedSessions,
    resetEmail: notification?.success ? "sent" : notification?.skipped ? "skipped" : "failed",
  });

  res.json({ success: true, message: "Password reset required. Active sessions revoked.", data: { emailSent: Boolean(notification?.success), revokedSessions } });
});

// POST /api/v1/admin/users/:id/send-password-reset
exports.sendCustomerPasswordReset = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(req.params.id, "+passwordResetToken +passwordResetExpires");
  const { notification } = await issuePasswordReset(user);
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, "admin.user.password_reset_email_sent", user, {
    resetEmail: notification?.success ? "sent" : notification?.skipped ? "skipped" : "failed",
  });

  res.json({ success: true, message: "Password reset email queued.", data: { emailSent: Boolean(notification?.success) } });
});

// POST /api/v1/admin/users/:id/revoke-sessions
exports.revokeCustomerSessions = asyncHandler(async (req, res) => {
  preventSelfAction(req, "revoke sessions for");
  const user = await getMutableUserOrThrow(req.params.id, "+refreshSessions");
  const revokedSessions = user.refreshSessions?.length || 0;
  user.refreshSessions = [];
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, "admin.user.sessions_revoked", user, { revokedSessions });

  res.json({ success: true, message: "Active sessions revoked.", data: { revokedSessions } });
});

// POST /api/v1/admin/users/:id/notes
exports.addCustomerInternalNote = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(req.params.id, "+internalNotes");
  user.internalNotes.push({ body: req.body.body, createdBy: req.user._id });
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, "admin.user.internal_note_created", user, { noteLength: req.body.body.length });

  const refreshed = await getCustomerOrThrow(req.params.id);
  res.status(201).json({ success: true, message: "Internal note added.", data: safeUser(refreshed).internalNotes || [] });
});

// GET /api/v1/admin/users/:id/security
exports.getCustomerSecurity = asyncHandler(async (req, res) => {
  const user = await getMutableUserOrThrow(req.params.id, "+refreshSessions +failedLoginAttempts +loginLockedUntil");
  const userObjectId = toObjectId(req.params.id);
  const filter = securityEventFilter(userObjectId);
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
    "admin.user.profile_updated",
    "admin.user.sessions_revoked",
    "admin.user.password_reset_forced",
    "admin.user.password_reset_email_sent",
    "admin.user.suspend",
    "admin.user.unsuspend",
    "admin.user.activate",
    "admin.user.deactivate",
    "admin.user.email_verified",
    "admin.user.email_unverified",
  ];

  const [loginHistory, securityEvents] = await Promise.all([
    AuditLog.find({ ...filter, action: { $in: loginActions } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("actorId", "name email role")
      .lean(),
    AuditLog.find({ ...filter, action: { $in: securityActions } })
      .sort({ createdAt: -1 })
      .limit(75)
      .populate("actorId", "name email role")
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      sessions: activeSerializedSessions(user),
      loginHistory,
      securityEvents,
      failedLogin: {
        attemptCount: user.failedLoginAttempts || 0,
        lockedUntil: user.loginLockedUntil || null,
      },
    },
  });
});

function securityEventFilter(userObjectId) {
  return {
    $or: [
      { actorId: userObjectId },
      { targetType: "User", targetId: userObjectId },
    ],
  };
}

// DELETE /api/v1/admin/users/:id/sessions/:sessionId
exports.revokeCustomerSession = asyncHandler(async (req, res) => {
  preventSelfAction(req, "revoke sessions for");
  const user = await getMutableUserOrThrow(req.params.id, "+refreshSessions");
  const before = user.refreshSessions?.length || 0;
  user.refreshSessions = (user.refreshSessions || []).filter((session) => session.sessionId !== req.params.sessionId);
  const revoked = before - (user.refreshSessions?.length || 0);
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, "admin.user.session_revoked", user, { sessionId: req.params.sessionId, revoked });

  res.json({ success: true, message: "Session terminated.", data: { revoked } });
});

// PATCH /api/v1/admin/users/:id/role
exports.updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!Object.values(ROLES).includes(role)) throw new AppError("Invalid role.", 422);
  if (req.params.id === req.user._id.toString()) throw new AppError("Cannot change your own role.", 403);

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) throw new AppError("User not found.", 404);
  await auditAdminUserEvent(req, "admin.user.role_updated", user, { role });
  res.json({ success: true, message: "Role updated.", data: user.toSafeJSON() });
});

// PATCH /api/v1/admin/users/:id/toggle-active
exports.toggleActive = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw new AppError("Cannot deactivate yourself.", 403);
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  user.isActive = !user.isActive;
  if (user.isActive) {
    user.isSuspended = false;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
  }
  await user.save({ validateBeforeSave: false });
  await auditAdminUserEvent(req, user.isActive ? "admin.user.activate" : "admin.user.deactivate", user, { legacyEndpoint: true });
  res.json({ success: true, message: `User ${user.isActive ? "activated" : "deactivated"}.`, data: user.toSafeJSON() });
});
