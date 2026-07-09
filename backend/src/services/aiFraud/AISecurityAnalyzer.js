const User = require("../../models/User");
const License = require("../../models/License");
const LicenseSite = require("../../models/LicenseSite");
const Download = require("../../models/Download");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const ApiKey = require("../../models/ApiKey");
const AuditLog = require("../../models/AuditLog");
const OrganizationMembership = require("../../models/OrganizationMembership");
const Scoring = require("./AIRiskScoringService");

const PERIOD_DAYS = { today: 1, "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

function parseRange({ period = "7d", start, end } = {}) {
  const rangeEnd = end ? new Date(end) : new Date();
  const rangeStart = start ? new Date(start) : new Date(rangeEnd.getTime() - (PERIOD_DAYS[period] || 7) * 86400000);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
    throw new Error("Invalid AI fraud analysis date range.");
  }
  return { period, start: rangeStart, end: rangeEnd };
}

function scoped(organizationId, extra = {}) {
  return organizationId ? { organizationId, ...extra } : { ...extra };
}

function rangeFilter(range) {
  return { createdAt: { $gte: range.start, $lte: range.end } };
}

function countBy(rows, key) {
  return rows.reduce((out, row) => {
    const value = String(row[key] || "unknown");
    out[value] = (out[value] || 0) + 1;
    return out;
  }, {});
}

function unique(rows, key) {
  return new Set(rows.map((row) => String(row[key] || "")).filter(Boolean)).size;
}

function createRisk({ organizationId, entityType, entityId = null, title, description, factors, evidence, range }) {
  const scored = Scoring.scoreFactors(factors);
  return {
    organizationId,
    entityType,
    entityId,
    title,
    description,
    evidence,
    timeRange: range,
    ...scored,
  };
}

async function collectData(organizationId, range) {
  const memberships = organizationId
    ? await OrganizationMembership.find({ organizationId, status: "active" }).select("userId").lean()
    : [];
  const memberIds = memberships.map((membership) => membership.userId);
  const userFilter = organizationId
    ? { $or: [{ activeOrganizationId: organizationId }, { _id: { $in: memberIds } }] }
    : {};
  const apiKeyFilter = organizationId && memberIds.length
    ? { ownerId: { $in: memberIds } }
    : organizationId ? { ownerId: { $in: [] } } : {};
  const [
    licenses,
    sites,
    downloads,
    payments,
    orders,
    apiKeys,
    users,
    auditLogs,
  ] = await Promise.all([
    License.find(scoped(organizationId)).select("status allowedSites activeDomains organizationId userId productId createdAt").lean(),
    LicenseSite.find(scoped(organizationId)).select("licenseId userId productId domain environment status blacklisted createdAt activatedAt lastHeartbeatAt organizationId").lean(),
    Download.find(scoped(organizationId, rangeFilter(range))).select("licenseId productId pluginVersionId assetType releaseChannel status ipAddress userAgent createdAt").lean(),
    Payment.find(scoped(organizationId, rangeFilter(range))).select("status amount currency gateway orderId createdAt").lean(),
    Order.find(scoped(organizationId, rangeFilter(range))).select("status paymentStatus userId productId grandTotal amount createdAt").lean(),
    ApiKey.find(apiKeyFilter).select("ownerId status usageCount lastUsedAt lastUsedIp scopes accessType environment createdAt").lean(),
    User.find(userFilter).select("+refreshSessions +failedLoginAttempts +loginLockedUntil name email role activeOrganizationId createdAt").lean(),
    AuditLog.find({ $or: [{ "metadata.organizationId": organizationId }, { targetId: organizationId }], ...rangeFilter(range) }).sort({ createdAt: -1 }).limit(500).lean(),
  ]);
  return { licenses, sites, downloads, payments, orders, apiKeys, users, auditLogs };
}

function analyzeLicenses(data, organizationId, range) {
  const byLicense = new Map();
  for (const site of data.sites) {
    const key = String(site.licenseId || "");
    if (!key) continue;
    byLicense.set(key, [...(byLicense.get(key) || []), site]);
  }
  const risks = [];
  for (const license of data.licenses) {
    const sites = byLicense.get(String(license._id)) || [];
    const domains = sites.map((site) => site.domain).filter(Boolean);
    const duplicateDomains = domains.length - new Set(domains).size;
    const limit = Number(license.allowedSites || 0);
    const overLimit = limit > 0 && sites.filter((site) => site.status === "active").length > limit;
    const flooded = sites.filter((site) => new Date(site.createdAt || site.activatedAt || 0) >= range.start).length;
    const blacklisted = sites.filter((site) => site.blacklisted).length;
    const factors = [
      Scoring.factor("activation_flooding", "Activation flooding", flooded >= 5 ? 35 : flooded >= 3 ? 20 : 0),
      Scoring.factor("license_limit_abuse", "License limit abuse", overLimit ? 35 : 0),
      Scoring.factor("duplicate_domains", "Duplicate domains", duplicateDomains > 0 ? 15 : 0),
      Scoring.factor("blacklisted_sites", "Blacklisted sites", blacklisted ? 25 : 0),
    ];
    const evidence = [
      Scoring.evidence("license_sites", "active_sites", sites.filter((site) => site.status === "active").length, limit || "unlimited", "Active site count compared with license limit."),
      Scoring.evidence("license_sites", "new_activations", flooded, 3, "New activations in selected range."),
      Scoring.evidence("license_sites", "duplicate_domains", duplicateDomains, 0, "Duplicate domain records for the same license."),
    ];
    const risk = createRisk({
      organizationId,
      entityType: "license",
      entityId: license._id,
      title: "License activation risk",
      description: "Activation behavior suggests possible sharing, flooding, duplicate domains, or limit abuse.",
      factors,
      evidence,
      range,
    });
    if (risk.score > 0) risks.push(risk);
  }
  return risks;
}

function analyzeDownloads(data, organizationId, range) {
  const byLicense = countBy(data.downloads, "licenseId");
  const denied = data.downloads.filter((download) => download.status === "denied").length;
  const top = Object.entries(byLicense).sort((a, b) => b[1] - a[1])[0];
  const factors = [
    Scoring.factor("download_flooding", "Download flooding", top?.[1] >= 20 ? 40 : top?.[1] >= 10 ? 25 : 0),
    Scoring.factor("denied_downloads", "Denied downloads", denied >= 10 ? 30 : denied >= 3 ? 15 : 0),
    Scoring.factor("repeated_asset_requests", "Repeated asset requests", data.downloads.length >= 30 ? 20 : 0),
  ];
  const risk = createRisk({
    organizationId,
    entityType: "download",
    title: "Download activity risk",
    description: "Download behavior indicates abnormal frequency, repeated requests, or entitlement failures.",
    factors,
    evidence: [
      Scoring.evidence("downloads", "total_downloads", data.downloads.length, 30, "Downloads in selected range."),
      Scoring.evidence("downloads", "denied_downloads", denied, 3, "Denied download attempts in selected range."),
      Scoring.evidence("downloads", "top_license_downloads", top?.[1] || 0, 10, "Highest per-license download count."),
    ],
    range,
  });
  return risk.score > 0 ? [risk] : [];
}

function analyzePayments(data, organizationId, range) {
  const failed = data.payments.filter((payment) => payment.status === "failed").length;
  const refunded = data.payments.filter((payment) => ["refunded", "partially_refunded"].includes(payment.status)).length;
  const failedOrders = data.orders.filter((order) => order.status === "failed" || order.paymentStatus === "failed").length;
  const risk = createRisk({
    organizationId,
    entityType: "payment",
    title: "Payment fraud risk",
    description: "Payment activity includes repeated failures, refunds, or failed order patterns.",
    factors: [
      Scoring.factor("failed_payments", "Repeated failed payments", failed >= 5 ? 40 : failed >= 2 ? 20 : 0),
      Scoring.factor("refund_patterns", "Refund pattern", refunded >= 3 ? 30 : refunded ? 15 : 0),
      Scoring.factor("failed_orders", "Failed order pattern", failedOrders >= 5 ? 25 : failedOrders >= 2 ? 10 : 0),
    ],
    evidence: [
      Scoring.evidence("payments", "failed_payments", failed, 2, "Failed payment records."),
      Scoring.evidence("payments", "refunds", refunded, 1, "Refunded or partially refunded payment records."),
      Scoring.evidence("orders", "failed_orders", failedOrders, 2, "Failed order records."),
    ],
    range,
  });
  return risk.score > 0 ? [risk] : [];
}

function analyzeAccounts(data, organizationId, range) {
  const failedLogs = data.auditLogs.filter((log) => ["auth.login_failed", "auth.login_blocked_locked", "auth.refresh_reuse_rejected"].includes(log.action));
  const passwordResets = data.auditLogs.filter((log) => String(log.action).includes("password_reset"));
  const sessions = data.users.flatMap((user) => (user.refreshSessions || []).map((session) => ({ userId: user._id, ...session })));
  const deviceCount = unique(sessions, "device");
  const ipCount = unique(sessions, "ipAddress");
  const risk = createRisk({
    organizationId,
    entityType: "account",
    title: "Account security risk",
    description: "Account activity includes failed logins, replay events, password reset frequency, or session changes.",
    factors: [
      Scoring.factor("failed_logins", "Failed login events", failedLogs.length >= 10 ? 40 : failedLogs.length >= 3 ? 20 : 0),
      Scoring.factor("password_resets", "Password reset frequency", passwordResets.length >= 5 ? 25 : passwordResets.length >= 2 ? 10 : 0),
      Scoring.factor("device_changes", "Device changes foundation", deviceCount >= 5 ? 15 : 0),
      Scoring.factor("location_changes", "Location changes foundation", ipCount >= 5 ? 15 : 0),
    ],
    evidence: [
      Scoring.evidence("audit_logs", "failed_login_events", failedLogs.length, 3, "Failed login and refresh replay audit events."),
      Scoring.evidence("audit_logs", "password_reset_events", passwordResets.length, 2, "Password reset audit events."),
      Scoring.evidence("sessions", "unique_devices", deviceCount, 5, "Unique devices from active sessions."),
      Scoring.evidence("sessions", "unique_ips", ipCount, 5, "Unique IP addresses from active sessions."),
    ],
    range,
  });
  return risk.score > 0 ? [risk] : [];
}

function analyzeApi(data, organizationId, range) {
  const activeAdminKeys = data.apiKeys.filter((key) => key.status === "active" && (key.scopes || []).includes("admin")).length;
  const highUsage = data.apiKeys.filter((key) => Number(key.usageCount || 0) > 5000).length;
  const authFailures = data.auditLogs.filter((log) => String(log.action).includes("api_key") && String(log.action).includes("rejected")).length;
  const risk = createRisk({
    organizationId,
    entityType: "api_key",
    title: "API security risk",
    description: "API key activity indicates possible abuse, broad scopes, high usage, or repeated authentication failures.",
    factors: [
      Scoring.factor("admin_api_keys", "Admin-scoped API keys", activeAdminKeys >= 2 ? 25 : activeAdminKeys ? 10 : 0),
      Scoring.factor("api_key_high_usage", "High API key usage", highUsage >= 2 ? 35 : highUsage ? 20 : 0),
      Scoring.factor("api_auth_failures", "API authentication failures", authFailures >= 5 ? 30 : authFailures ? 10 : 0),
    ],
    evidence: [
      Scoring.evidence("api_keys", "active_admin_keys", activeAdminKeys, 1, "Active API keys with admin scope."),
      Scoring.evidence("api_keys", "high_usage_keys", highUsage, 1, "API keys above high usage threshold."),
      Scoring.evidence("audit_logs", "api_auth_failures", authFailures, 1, "API key rejection audit events."),
    ],
    range,
  });
  return risk.score > 0 ? [risk] : [];
}

async function analyze({ organizationId, period, start, end } = {}) {
  const range = parseRange({ period, start, end });
  const data = await collectData(organizationId, range);
  const risks = [
    ...analyzeLicenses(data, organizationId, range),
    ...analyzeDownloads(data, organizationId, range),
    ...analyzePayments(data, organizationId, range),
    ...analyzeAccounts(data, organizationId, range),
    ...analyzeApi(data, organizationId, range),
  ].sort((a, b) => b.score - a.score);
  const topThreats = risks.slice(0, 5);
  return {
    timeRange: range,
    risks,
    topThreats,
    highRiskLicenses: risks.filter((risk) => risk.entityType === "license" && ["high", "critical"].includes(risk.riskLevel)),
    highRiskOrganizations: risks.filter((risk) => risk.entityType === "organization" && ["high", "critical"].includes(risk.riskLevel)),
    recentSecurityEvents: data.auditLogs.slice(0, 20),
    riskTrends: risks.reduce((out, risk) => ({ ...out, [risk.riskLevel]: (out[risk.riskLevel] || 0) + 1 }), { low: 0, medium: 0, high: 0, critical: 0 }),
  };
}

module.exports = { analyze, parseRange };
