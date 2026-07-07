const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const Plan = require("../models/Plan");
const User = require("../models/User");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const licenseEngineConfig = require("../config/licenseEngine");

const ACTIVE_STATES = ["active", "trial", "lifetime"];
const TERMINAL_STATES = ["revoked", "cancelled"];
const SUBSCRIPTION_STATUSES = ["none", "trialing", "active", "past_due", "paused", "cancelled", "expired", "manual"];

function isLifetime(license) {
  return license?.status === "lifetime" || license?.entitlements?.lifetimeUpdates || license?.expiresAt === null;
}

function gracePeriodDays(license) {
  return Number(license?.renewal?.gracePeriodDays ?? licenseEngineConfig.expiration.gracePeriodDays) || 0;
}

function isExpiredByDate(license, at = new Date()) {
  if (!license?.expiresAt || isLifetime(license)) return false;
  const graceMs = gracePeriodDays(license) * 24 * 60 * 60 * 1000;
  return at.getTime() > new Date(license.expiresAt).getTime() + graceMs;
}

function isWithinGrace(license, at = new Date()) {
  if (!license?.expiresAt || isLifetime(license)) return false;
  const expiresAt = new Date(license.expiresAt).getTime();
  const graceMs = gracePeriodDays(license) * 24 * 60 * 60 * 1000;
  return at.getTime() > expiresAt && at.getTime() <= expiresAt + graceMs;
}

function isWithinRenewalWindow(license, at = new Date()) {
  if (!license?.expiresAt || isLifetime(license)) return false;
  const windowDays = Number(license?.renewal?.renewalWindowDays ?? 30) || 0;
  const windowStart = new Date(license.expiresAt).getTime() - windowDays * 24 * 60 * 60 * 1000;
  return at.getTime() >= windowStart || isWithinGrace(license, at) || effectiveStatus(license, at) === "expired";
}

function effectiveStatus(license, at = new Date()) {
  if (!license) return "missing";
  if (TERMINAL_STATES.includes(license.status)) return license.status;
  if (license.status === "suspended") return "suspended";
  if (isExpiredByDate(license, at)) return "expired";
  return license.status;
}

function defaultEntitlements(license) {
  const lifetime = isLifetime(license);
  return {
    downloads: license?.entitlements?.downloads !== false,
    updates: license?.entitlements?.updates !== false || lifetime,
    activations: license?.entitlements?.activations !== false,
    betaChannel: Boolean(license?.entitlements?.betaChannel || license?.allowedReleaseChannels?.includes("beta")),
    prioritySupport: Boolean(license?.entitlements?.prioritySupport),
    lifetimeUpdates: Boolean(license?.entitlements?.lifetimeUpdates || lifetime),
    lifetimeSupport: Boolean(license?.entitlements?.lifetimeSupport || lifetime),
  };
}

function entitlementSummary(license) {
  const status = effectiveStatus(license);
  const entitlements = defaultEntitlements(license);
  const activationLimit = license.allowedSites === 0 ? null : license.allowedSites;
  const usedActivations = license.activeDomains?.length || 0;
  return {
    effectiveStatus: status,
    entitlements,
    inGracePeriod: isWithinGrace(license),
    gracePeriodDays: gracePeriodDays(license),
    renewalWindowDays: Number(license?.renewal?.renewalWindowDays ?? 30) || 0,
    canDownload: (ACTIVE_STATES.includes(status) || isWithinGrace(license)) && entitlements.downloads,
    canUpdate: (ACTIVE_STATES.includes(status) || isWithinGrace(license)) && entitlements.updates,
    canActivate: ACTIVE_STATES.includes(status) && entitlements.activations,
    renewalEligible: Boolean(license.renewal?.eligible) && !["revoked", "cancelled", "lifetime"].includes(status) && isWithinRenewalWindow(license),
    upgradeEligible: !["revoked", "cancelled"].includes(status),
    subscription: license.subscription || { status: "none" },
    usedActivations,
    remainingActivations: activationLimit === null ? null : Math.max(0, activationLimit - usedActivations),
    allowedSites: license.allowedSites,
    activationLimit,
  };
}

async function markExpiredIfNeeded(license) {
  if (!license || license.status === "expired" || TERMINAL_STATES.includes(license.status)) return license;
  if (!isExpiredByDate(license)) return license;
  license.status = "expired";
  license.expiredAt = license.expiredAt || new Date();
  if (typeof license.save === "function") {
    await license.save({ validateBeforeSave: false });
  }
  await writeAuditLog({
    action: "license.expired",
    targetType: "License",
    targetId: license._id,
    metadata: { licenseKey: license.licenseKey, expiresAt: license.expiresAt, automatic: true },
  });
  return license;
}

function assertEntitlement(license, entitlement, message) {
  const summary = entitlementSummary(license);
  const key = `can${entitlement.charAt(0).toUpperCase()}${entitlement.slice(1)}`;
  if (!summary[key]) throw new AppError(message || `License is not entitled for ${entitlement}.`, 403);
  return summary;
}

async function audit({ actor, action, license, req, metadata = {} }) {
  await writeAuditLog({
    actor,
    action,
    targetType: "License",
    targetId: license?._id || null,
    metadata: { licenseKey: license?.licenseKey, ...metadata },
    ip: req?.ip,
  });
}

async function transitionLicense({ license, action, actor, req, payload = {} }) {
  if (!license) throw new AppError("License not found.", 404);
  const now = new Date();

  if (action === "activate") {
    if (license.status === "revoked") throw new AppError("Cannot activate a revoked license.", 400);
    license.status = "active";
    license.activatedAt = license.activatedAt || now;
    license.activatedBy = actor?._id || null;
  } else if (action === "suspend") {
    if (license.status === "revoked") throw new AppError("Cannot suspend a revoked license.", 400);
    license.status = "suspended";
    license.suspendedAt = now;
    license.suspendedBy = actor?._id || null;
  } else if (action === "unsuspend" || action === "reinstate") {
    if (license.status === "revoked") throw new AppError("Cannot reinstate a revoked license.", 400);
    license.status = isLifetime(license) ? "lifetime" : "active";
    license.suspendedAt = null;
    license.suspendedBy = null;
  } else if (action === "expire") {
    license.status = "expired";
    license.expiredAt = now;
    license.expiredBy = actor?._id || null;
    license.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : license.expiresAt || now;
  } else if (action === "revoke") {
    license.status = "revoked";
    license.revokedAt = now;
    license.revokedBy = actor?._id || null;
  } else if (action === "cancel") {
    license.status = "cancelled";
    license.cancelledAt = now;
    license.cancelledBy = actor?._id || null;
  } else if (action === "convert_trial") {
    license.status = "active";
    license.trialConvertedAt = now;
  } else if (action === "convert_lifetime") {
    license.status = "lifetime";
    license.expiresAt = null;
    license.lifetimeConvertedAt = now;
    license.entitlements = {
      ...defaultEntitlements(license),
      lifetimeUpdates: true,
      lifetimeSupport: true,
    };
  } else {
    throw new AppError("Unsupported license action.", 422);
  }

  if (payload.notes !== undefined) license.notes = payload.notes;
  await license.save();
  await audit({ actor, action: `license.${action}`, license, req, metadata: { reason: payload.reason || "", note: payload.note || "" } });
  return license;
}

function assertRenewalAllowed(license, { allowEarly = false } = {}) {
  if (!license) throw new AppError("License not found.", 404);
  if (license.status === "revoked" || license.status === "cancelled") throw new AppError("This license is not renewable.", 400);
  if (isLifetime(license)) throw new AppError("Lifetime licenses do not need renewal.", 400);
  if (license.renewal?.eligible === false) throw new AppError("This license is not eligible for renewal.", 403);
  if (!allowEarly && !isWithinRenewalWindow(license)) throw new AppError("This license is not inside the renewal window.", 400);
}

function assertNotDuplicateRenewal(license, newExpiresAt) {
  const latest = (license.renewalHistory || []).slice(-1)[0];
  if (!latest) return;
  const latestExpiry = latest.newExpiresAt ? new Date(latest.newExpiresAt).getTime() : 0;
  if (latestExpiry && latestExpiry === new Date(newExpiresAt).getTime()) {
    throw new AppError("Duplicate renewal detected.", 409);
  }
}

async function renewLicense({ license, actor, req, expiresAt, durationDays, note = "", reason = "manual_renewal", allowEarly = false }) {
  assertRenewalAllowed(license, { allowEarly });

  const previousExpiresAt = license.expiresAt || null;
  const newExpiresAt = expiresAt
    ? new Date(expiresAt)
    : new Date(Math.max(Date.now(), previousExpiresAt ? new Date(previousExpiresAt).getTime() : Date.now()) + (Number(durationDays || 365) * 24 * 60 * 60 * 1000));
  assertNotDuplicateRenewal(license, newExpiresAt);
  if (previousExpiresAt && newExpiresAt <= new Date(previousExpiresAt)) throw new AppError("Renewal must extend the current expiration.", 400);

  license.expiresAt = newExpiresAt;
  license.status = "active";
  license.renewal = {
    ...(license.renewal || {}),
    eligible: true,
    lastRenewedAt: new Date(),
    nextRenewalAt: newExpiresAt,
  };
  license.subscription = {
    ...(license.subscription || {}),
    status: license.subscription?.autoRenew || license.renewal?.autoRenew ? "active" : "manual",
    renewalDate: newExpiresAt,
    nextBillingAt: license.subscription?.autoRenew || license.renewal?.autoRenew ? newExpiresAt : license.subscription?.nextBillingAt || null,
    manualRenewal: !(license.subscription?.autoRenew || license.renewal?.autoRenew),
    autoRenew: Boolean(license.subscription?.autoRenew || license.renewal?.autoRenew),
  };
  license.renewalHistory.push({
    previousExpiresAt,
    newExpiresAt,
    actorId: actor?._id || null,
    reason,
    note,
  });
  await license.save();
  await audit({ actor, action: "license.renewed", license, req, metadata: { previousExpiresAt, newExpiresAt, reason, note } });
  return license;
}

async function transferLicense({ license, toUserId, actor, req, note = "" }) {
  if (!license) throw new AppError("License not found.", 404);
  const toUser = await User.findById(toUserId);
  if (!toUser) throw new AppError("Target customer not found.", 404);
  const fromUserId = license.userId;
  license.userId = toUserId;
  license.transferHistory.push({
    fromUserId,
    toUserId,
    actorId: actor?._id || null,
    status: "completed",
    note,
  });
  await license.save();
  await audit({ actor, action: "license.transferred", license, req, metadata: { fromUserId, toUserId, note } });
  return license;
}

function planRank(plan) {
  if (Number.isFinite(Number(plan?.upgradeRank))) return Number(plan.upgradeRank);
  if (plan?.allowedSites === 0) return 100;
  return Number(plan?.allowedSites || 0);
}

async function changePlan({ license, toPlanId, actor, req, changeType = "upgrade", note = "", reason = "" }) {
  if (!license) throw new AppError("License not found.", 404);
  const plan = await Plan.findOne({ _id: toPlanId, productId: license.productId, isActive: true });
  if (!plan) throw new AppError("Plan not found or does not belong to this product.", 404);
  if (license.status === "revoked" || license.status === "cancelled") throw new AppError("This license cannot change plans.", 400);
  if (String(license.planId) === String(plan._id)) throw new AppError("License is already on this plan.", 409);
  const fromPlanId = license.planId;
  const fromAllowedSites = license.allowedSites;
  const currentPlan = await Plan.findById?.(license.planId);
  const currentRank = currentPlan ? planRank(currentPlan) : (fromAllowedSites === 0 ? 100 : fromAllowedSites);
  const nextRank = planRank(plan);
  if (changeType === "upgrade" && nextRank <= currentRank) throw new AppError("Target plan is not an upgrade.", 400);
  if (changeType === "downgrade" && nextRank >= currentRank) throw new AppError("Target plan is not a downgrade.", 400);
  license.planId = plan._id;
  license.allowedSites = plan.allowedSites;
  license.licenseType = plan.planType === "custom" ? license.licenseType : plan.planType || license.licenseType;
  if (plan.planType === "lifetime") {
    license.status = "lifetime";
    license.expiresAt = null;
    license.entitlements = { ...defaultEntitlements(license), lifetimeUpdates: true, lifetimeSupport: true };
  } else if (plan.planType === "trial") {
    license.status = "trial";
  }
  license.upgradeHistory.push({
    fromPlanId,
    toPlanId: plan._id,
    fromAllowedSites,
    toAllowedSites: plan.allowedSites,
    fromPlanType: currentPlan?.planType || "",
    toPlanType: plan.planType || "",
    changeType,
    actorId: actor?._id || null,
    reason,
    note,
  });
  await license.save();
  await audit({ actor, action: `license.${changeType}`, license, req, metadata: { fromPlanId, toPlanId: plan._id, reason, note } });
  return license;
}

async function transitionSubscription({ license, action, actor, req, reason = "" }) {
  if (!license) throw new AppError("License not found.", 404);
  const now = new Date();
  const fromStatus = license.subscription?.status || "none";
  let toStatus = fromStatus;
  const subscription = { ...(license.subscription || {}) };

  if (action === "pause") {
    if (fromStatus === "cancelled" || fromStatus === "expired") throw new AppError("Cannot pause this subscription state.", 400);
    toStatus = "paused";
    subscription.pausedAt = now;
  } else if (action === "resume") {
    if (fromStatus !== "paused") throw new AppError("Only paused subscriptions can be resumed.", 400);
    toStatus = subscription.autoRenew ? "active" : "manual";
    subscription.resumedAt = now;
  } else if (action === "cancel") {
    if (fromStatus === "cancelled") throw new AppError("Subscription is already cancelled.", 409);
    toStatus = "cancelled";
    subscription.cancelledAt = now;
    subscription.autoRenew = false;
    subscription.manualRenewal = true;
  } else if (action === "expire") {
    toStatus = "expired";
    subscription.expiredAt = now;
    license.status = "expired";
  } else if (action === "enable_auto_renew") {
    toStatus = "active";
    subscription.autoRenew = true;
    subscription.manualRenewal = false;
  } else if (action === "disable_auto_renew") {
    toStatus = "manual";
    subscription.autoRenew = false;
    subscription.manualRenewal = true;
  } else {
    throw new AppError("Unsupported subscription action.", 422);
  }

  subscription.status = toStatus;
  if (!subscription.startedAt && toStatus !== "none") subscription.startedAt = now;
  license.subscription = subscription;
  license.renewal = { ...(license.renewal || {}), autoRenew: Boolean(subscription.autoRenew) };
  license.subscriptionHistory.push({
    fromStatus,
    toStatus,
    action,
    actorId: actor?._id || null,
    reason,
  });
  await license.save();
  await audit({ actor, action: `subscription.${action}`, license, req, metadata: { fromStatus, toStatus, reason } });
  return license;
}

async function activateDomain({ license, domain, actor, actorRole = "admin", req, manual = false }) {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) throw new AppError("Invalid domain format.", 422);
  await markExpiredIfNeeded(license);
  const summary = assertEntitlement(license, "activate", "This license is not eligible for activation.");

  if (license.activeDomains.some((entry) => entry.domain === normalizedDomain)) return license;
  if (summary.remainingActivations !== null && summary.remainingActivations <= 0) {
    throw new AppError("Activation limit reached.", 403);
  }
  license.activeDomains.push({ domain: normalizedDomain, activatedAt: new Date() });
  await license.save();
  await LicenseActivation.create({
    licenseId: license._id,
    domain: normalizedDomain,
    action: manual ? "manual_activate" : "activate",
    actorId: actor?._id || null,
    actorRole,
    ipAddress: req?.ip || "",
  });
  await audit({ actor, action: manual ? "license.manual_activation" : "license.domain_activated", license, req, metadata: { domain: normalizedDomain, actorRole } });
  return license;
}

async function deactivateDomain({ license, domain, actor, actorRole = "admin", req, force = false }) {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) throw new AppError("Invalid domain format.", 422);
  const before = license.activeDomains.length;
  license.activeDomains = license.activeDomains.filter((entry) => entry.domain !== normalizedDomain);
  if (license.activeDomains.length === before) return license;
  await license.save();
  await LicenseActivation.create({
    licenseId: license._id,
    domain: normalizedDomain,
    action: force ? "force_deactivate" : "deactivate",
    actorId: actor?._id || null,
    actorRole,
    ipAddress: req?.ip || "",
  });
  await audit({ actor, action: force ? "license.force_deactivated" : "license.domain_deactivated", license, req, metadata: { domain: normalizedDomain, actorRole } });
  return license;
}

async function resetActivations({ license, actor, req }) {
  const previousDomains = [...(license.activeDomains || [])];
  license.activeDomains = [];
  await license.save();
  if (previousDomains.length) {
    await LicenseActivation.insertMany(previousDomains.map((entry) => ({
      licenseId: license._id,
      domain: entry.domain,
      action: "reset",
      actorId: actor?._id || null,
      actorRole: "admin",
      ipAddress: req?.ip || "",
    })));
  }
  await audit({ actor, action: "license.activations_reset", license, req, metadata: { clearedDomains: previousDomains.map((entry) => entry.domain) } });
  return license;
}

function attachLifecycleSummary(license) {
  if (!license) return license;
  const plain = typeof license.toObject === "function" ? license.toObject({ virtuals: true }) : { ...license };
  return {
    ...plain,
    lifecycle: entitlementSummary(plain),
  };
}

module.exports = {
  ACTIVE_STATES,
  SUBSCRIPTION_STATUSES,
  effectiveStatus,
  isExpiredByDate,
  isWithinGrace,
  isWithinRenewalWindow,
  markExpiredIfNeeded,
  entitlementSummary,
  assertEntitlement,
  assertRenewalAllowed,
  attachLifecycleSummary,
  transitionLicense,
  renewLicense,
  transferLicense,
  changePlan,
  transitionSubscription,
  activateDomain,
  deactivateDomain,
  resetActivations,
};
