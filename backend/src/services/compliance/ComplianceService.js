const crypto = require("crypto");
const OrganizationService = require("../organizationService");
const CompliancePolicy = require("../../models/CompliancePolicy");
const ComplianceExport = require("../../models/ComplianceExport");
const LegalHold = require("../../models/LegalHold");
const ConsentRecord = require("../../models/ConsentRecord");
const Organization = require("../../models/Organization");
const User = require("../../models/User");
const License = require("../../models/License");
const Order = require("../../models/Order");
const Download = require("../../models/Download");
const Payment = require("../../models/Payment");
const AuditLog = require("../../models/AuditLog");
const InAppNotification = require("../../models/InAppNotification");
const IdentityAuditEvent = require("../../models/IdentityAuditEvent");
const OrganizationMembership = require("../../models/OrganizationMembership");
const UserMfaMethod = require("../../models/UserMfaMethod");
const OrganizationSecurityPolicy = require("../../models/OrganizationSecurityPolicy");
const { AppError } = require("../../utils/errorHandler");
const { writeAuditLog } = require("../../utils/auditLog");

const EXPORT_RESOURCES = ["organizations", "users", "licenses", "orders", "downloads", "payments", "audit_logs"];
const REPORT_TYPES = ["audit", "security", "gdpr", "organization_activity"];

const DEFAULT_POLICY = {
  gdpr: {
    allowPersonalDataExport: true,
    allowPersonalDataDeletion: true,
    anonymizeInsteadOfDelete: true,
    deletionReviewRequired: true,
  },
  privacy: {
    requireMarketingConsent: true,
    allowDataSharingOptOut: true,
    consentVersion: "1.0",
  },
  retention: {
    auditLogRetentionDays: 2555,
    orderRetentionDays: 2555,
    licenseRetentionDays: 2555,
    notificationRetentionDays: 365,
    customRules: [],
  },
  exports: {
    allowedFormats: ["json", "csv"],
    maxRowsPerExport: 25000,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergePolicy(policy) {
  const merged = clone(DEFAULT_POLICY);
  if (!policy) return merged;
  ["gdpr", "privacy", "retention", "exports"].forEach((section) => {
    merged[section] = { ...merged[section], ...(policy[section]?.toObject?.() || policy[section] || {}) };
  });
  return merged;
}

function makeCsv(rows = []) {
  const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [allKeys.join(","), ...rows.map((row) => allKeys.map((key) => escape(row[key])).join(","))].join("\n");
}

function flattenPayload(payload) {
  return Object.entries(payload).flatMap(([resource, rows]) =>
    (Array.isArray(rows) ? rows : [rows]).map((row) => ({ resource, ...(row || {}) }))
  );
}

function checksum(payload) {
  return crypto.createHash("sha256").update(typeof payload === "string" ? payload : JSON.stringify(payload)).digest("hex");
}

async function audit(action, { actor = null, organizationId = null, targetId = null, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({
    actor,
    action,
    targetType: "Compliance",
    targetId: targetId || organizationId,
    metadata: { organizationId, ...metadata },
    ip,
    requestId,
  }).catch(() => null);
}

async function assertManage(actor, organizationId) {
  if (!actor) throw new AppError("Authentication required.", 401);
  if (actor.role === "admin") return true;
  const { membership } = await OrganizationService.assertMembership(actor._id, organizationId);
  if (!["owner", "admin"].includes(membership.role)) {
    throw new AppError("You do not have permission to manage compliance.", 403);
  }
  return true;
}

async function ensurePolicy(organizationId) {
  let policy = await CompliancePolicy.findOne({ organizationId });
  if (!policy) policy = await CompliancePolicy.create({ organizationId });
  return policy;
}

async function updatePolicy(organizationId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const policy = await ensurePolicy(organizationId);
  ["gdpr", "privacy", "retention", "exports"].forEach((section) => {
    if (input[section] && typeof input[section] === "object") {
      policy[section] = { ...(policy[section]?.toObject?.() || policy[section] || {}), ...input[section] };
    }
  });
  policy.updatedBy = context.actor?._id;
  await policy.save();
  await audit("compliance.retention_policy_changed", { ...context, organizationId, metadata: { sections: Object.keys(input) } });
  return mergePolicy(policy);
}

async function activeLegalHold(organizationId, resource = "all", subjectUserId = null) {
  const holds = await LegalHold.find({ organizationId, status: "active" }).lean();
  return holds.find((hold) => {
    const protects = (hold.protectedResources || []).includes("all") || (hold.protectedResources || []).includes(resource);
    const subjectMatches = !hold.subjectUserId || !subjectUserId || String(hold.subjectUserId) === String(subjectUserId);
    return protects && subjectMatches;
  }) || null;
}

async function createLegalHold(organizationId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const hold = await LegalHold.create({
    organizationId,
    name: input.name,
    reason: input.reason || "",
    status: "active",
    protectedResources: input.protectedResources?.length ? input.protectedResources : ["all"],
    subjectUserId: input.subjectUserId || null,
    enabledBy: context.actor._id,
  });
  await audit("compliance.legal_hold_enabled", { ...context, organizationId, targetId: hold._id, metadata: { protectedResources: hold.protectedResources } });
  return hold;
}

async function releaseLegalHold(organizationId, holdId, context = {}) {
  await assertManage(context.actor, organizationId);
  const hold = await LegalHold.findOne({ _id: holdId, organizationId });
  if (!hold) throw new AppError("Legal hold not found.", 404);
  hold.status = "released";
  hold.releasedBy = context.actor._id;
  hold.releasedAt = new Date();
  await hold.save();
  await audit("compliance.legal_hold_removed", { ...context, organizationId, targetId: hold._id });
  return hold;
}

async function collectExportData(organizationId, resources = EXPORT_RESOURCES, subjectUserId = null, limit = 25000) {
  const queryUser = subjectUserId ? { userId: subjectUserId } : {};
  const payload = {};

  if (resources.includes("organizations")) {
    payload.organizations = await Organization.find({ _id: organizationId }).limit(limit).lean();
  }
  if (resources.includes("users")) {
    const memberships = await OrganizationMembership.find({ organizationId, ...(subjectUserId ? { userId: subjectUserId } : {}) }).populate("userId", "name email role companyName isActive isSuspended createdAt lastLoginAt twoFactorEnabled").limit(limit).lean();
    payload.users = memberships.map((membership) => ({ membershipRole: membership.role, membershipStatus: membership.status, user: membership.userId }));
  }
  if (resources.includes("licenses")) {
    payload.licenses = await License.find({ organizationId, ...queryUser }).limit(limit).lean();
  }
  if (resources.includes("orders")) {
    payload.orders = await Order.find({ organizationId, ...queryUser }).limit(limit).lean();
  }
  if (resources.includes("downloads")) {
    payload.downloads = await Download.find({ organizationId, ...queryUser }).limit(limit).lean();
  }
  if (resources.includes("payments")) {
    payload.payments = await Payment.find({ organizationId }).limit(limit).lean();
  }
  if (resources.includes("audit_logs")) {
    payload.audit_logs = await AuditLog.find({
      $or: [
        { "metadata.organizationId": organizationId },
        ...(subjectUserId ? [{ actorId: subjectUserId }, { targetType: "User", targetId: subjectUserId }] : []),
      ],
    }).limit(limit).lean();
  }
  return payload;
}

async function requestExport(organizationId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const policy = mergePolicy(await ensurePolicy(organizationId));
  const format = input.format || "json";
  if (!policy.exports.allowedFormats.includes(format)) throw new AppError("Export format is not allowed.", 422);
  const resources = (input.resources?.length ? input.resources : EXPORT_RESOURCES).filter((item) => EXPORT_RESOURCES.includes(item));
  await audit("compliance.export_requested", { ...context, organizationId, metadata: { format, resources, subjectUserId: input.subjectUserId || null } });
  const data = await collectExportData(organizationId, resources, input.subjectUserId || null, policy.exports.maxRowsPerExport);
  const payload = format === "csv" ? makeCsv(flattenPayload(data)) : data;
  const rowCounts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 1]));
  const record = await ComplianceExport.create({
    organizationId,
    requestedBy: context.actor._id,
    subjectUserId: input.subjectUserId || null,
    format,
    resources,
    status: "completed",
    rowCounts,
    checksumSha256: checksum(payload),
    payload,
    completedAt: new Date(),
  });
  await audit("compliance.export_completed", { ...context, organizationId, targetId: record._id, metadata: { rowCounts, checksumSha256: record.checksumSha256 } });
  return { exportId: record._id, format, resources, rowCounts, checksumSha256: record.checksumSha256, payload };
}

async function recordConsent(userId, organizationId, input = {}, context = {}) {
  if (context.actor?._id?.toString() !== userId.toString() && context.actor?.role !== "admin") {
    throw new AppError("You cannot update another user's consent preferences.", 403);
  }
  const record = await ConsentRecord.create({
    organizationId,
    userId,
    type: input.type,
    status: input.status,
    version: input.version || "1.0",
    source: input.source || "customer_portal",
    ipAddress: context.ip || "",
    userAgent: context.userAgent || "",
    metadata: input.metadata || {},
  });
  await audit(input.status === "withdrawn" ? "compliance.consent_withdrawn" : "compliance.consent_recorded", { ...context, organizationId, targetId: userId, metadata: { type: input.type, status: input.status } });
  return record;
}

async function consentHistory(userId, organizationId, context = {}) {
  if (context.actor?._id?.toString() !== userId.toString() && context.actor?.role !== "admin") {
    throw new AppError("You cannot view another user's consent history.", 403);
  }
  return ConsentRecord.find({ userId, organizationId }).sort({ createdAt: -1 }).lean();
}

async function anonymizeUser(userId, organizationId, context = {}) {
  await assertManage(context.actor, organizationId);
  if (await activeLegalHold(organizationId, "users", userId)) {
    await audit("compliance.deletion_requested", { ...context, organizationId, targetId: userId, metadata: { blockedByLegalHold: true } });
    throw new AppError("Deletion is blocked by an active legal hold.", 409);
  }
  const policy = mergePolicy(await ensurePolicy(organizationId));
  if (!policy.gdpr.allowPersonalDataDeletion) throw new AppError("Personal data deletion is disabled by policy.", 403);
  const anonymizedEmail = `deleted-${crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 16)}@anonymous.local`;
  const user = await User.findByIdAndUpdate(userId, {
    name: "Deleted User",
    email: anonymizedEmail,
    companyName: "",
    isActive: false,
    refreshSessions: [],
  }, { new: true });
  await ConsentRecord.deleteMany?.({ userId, organizationId }).catch?.(() => null);
  await audit("compliance.deletion_completed", { ...context, organizationId, targetId: userId, metadata: { anonymized: true } });
  return { anonymized: true, user };
}

async function retentionPreview(organizationId, context = {}) {
  await assertManage(context.actor, organizationId);
  const policy = mergePolicy(await ensurePolicy(organizationId));
  const now = Date.now();
  const olderThan = (days) => new Date(now - days * 24 * 60 * 60 * 1000);
  const [auditLogs, orders, licenses, notifications] = await Promise.all([
    AuditLog.countDocuments({ "metadata.organizationId": organizationId, createdAt: { $lt: olderThan(policy.retention.auditLogRetentionDays) } }),
    Order.countDocuments({ organizationId, createdAt: { $lt: olderThan(policy.retention.orderRetentionDays) } }),
    License.countDocuments({ organizationId, createdAt: { $lt: olderThan(policy.retention.licenseRetentionDays) } }),
    InAppNotification.countDocuments({ createdAt: { $lt: olderThan(policy.retention.notificationRetentionDays) } }),
  ]);
  return { auditLogs, orders, licenses, notifications, policy: policy.retention };
}

async function generateReport(organizationId, type = "audit", context = {}) {
  await assertManage(context.actor, organizationId);
  if (!REPORT_TYPES.includes(type)) throw new AppError("Unknown compliance report type.", 422);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = { organizationId, type, generatedAt: new Date() };
  if (type === "audit") {
    const [total, exports, deletions, policyChanges] = await Promise.all([
      AuditLog.countDocuments({ "metadata.organizationId": organizationId }),
      AuditLog.countDocuments({ "metadata.organizationId": organizationId, action: /compliance\.export/ }),
      AuditLog.countDocuments({ "metadata.organizationId": organizationId, action: /compliance\.deletion/ }),
      AuditLog.countDocuments({ "metadata.organizationId": organizationId, action: "compliance.retention_policy_changed" }),
    ]);
    return { ...base, totalAuditEvents: total, exports, deletions, policyChanges };
  }
  if (type === "security") {
    const [failedLogins, mfaMethods, sessions, passwordPolicy] = await Promise.all([
      IdentityAuditEvent.countDocuments({ organizationId, status: { $in: ["failed", "denied"] }, createdAt: { $gte: since } }),
      UserMfaMethod.countDocuments({ organizationId, status: "enabled" }),
      User.countDocuments({ activeOrganizationId: organizationId }),
      OrganizationSecurityPolicy.findOne({ organizationId }).lean(),
    ]);
    return { ...base, failedLogins, mfaEnabledUsers: mfaMethods, activeOrganizationUsers: sessions, passwordPolicyConfigured: Boolean(passwordPolicy) };
  }
  if (type === "gdpr") {
    const [exports, holds, consents] = await Promise.all([
      ComplianceExport.countDocuments({ organizationId, createdAt: { $gte: since } }),
      LegalHold.countDocuments({ organizationId, status: "active" }),
      ConsentRecord.countDocuments({ organizationId }),
    ]);
    return { ...base, exports, activeLegalHolds: holds, consentEvents: consents };
  }
  const [members, orders, licenses, downloads] = await Promise.all([
    OrganizationMembership.countDocuments({ organizationId, status: "active" }),
    Order.countDocuments({ organizationId, createdAt: { $gte: since } }),
    License.countDocuments({ organizationId, createdAt: { $gte: since } }),
    Download.countDocuments({ organizationId, createdAt: { $gte: since } }),
  ]);
  return { ...base, members, orders, licenses, downloads };
}

async function dashboard(organizationId, context = {}) {
  await assertManage(context.actor, organizationId);
  const [policy, holds, exports, consents, retention, reports] = await Promise.all([
    ensurePolicy(organizationId),
    LegalHold.find({ organizationId }).sort({ createdAt: -1 }).limit(20).lean(),
    ComplianceExport.find({ organizationId }).sort({ createdAt: -1 }).limit(20).select("-payload").lean(),
    ConsentRecord.find({ organizationId }).sort({ createdAt: -1 }).limit(20).lean(),
    retentionPreview(organizationId, context),
    Promise.all(REPORT_TYPES.map((type) => generateReport(organizationId, type, context))),
  ]);
  return {
    policy: mergePolicy(policy),
    legalHolds: holds,
    exports,
    consentEvents: consents,
    retentionPreview: retention,
    reports,
    reportTypes: REPORT_TYPES,
    exportResources: EXPORT_RESOURCES,
  };
}

module.exports = {
  DEFAULT_POLICY,
  EXPORT_RESOURCES,
  REPORT_TYPES,
  activeLegalHold,
  anonymizeUser,
  consentHistory,
  createLegalHold,
  dashboard,
  generateReport,
  recordConsent,
  releaseLegalHold,
  requestExport,
  retentionPreview,
  updatePolicy,
  mergePolicy,
  makeCsv,
};
