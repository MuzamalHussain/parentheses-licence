const Organization = require("../models/Organization");
const OrganizationMembership = require("../models/OrganizationMembership");
const OrganizationInvitation = require("../models/OrganizationInvitation");
const mongoose = require("mongoose");
const User = require("../models/User");
const License = require("../models/License");
const Order = require("../models/Order");
const Download = require("../models/Download");
const LicenseSite = require("../models/LicenseSite");
const { writeAuditLog } = require("../utils/auditLog");

const CONTROL_ROLES = ["owner", "admin"];
const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

function isObjectIdLike(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function makeError(message, statusCode = 422, code = "ORGANIZATION_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

async function audit(action, { actor, organizationId, targetId = null, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({
    actor,
    action,
    targetType: "Organization",
    targetId: targetId || organizationId,
    metadata: { organizationId, ...metadata },
    ip,
    requestId,
  });
}

async function getActiveMembership(userId, organizationId) {
  if (!organizationId) return null;
  if (!isObjectIdLike(userId) || !isObjectIdLike(organizationId)) return null;
  return OrganizationMembership.findOne({ userId, organizationId, status: "active" });
}

async function assertMembership(userId, organizationId) {
  const membership = await getActiveMembership(userId, organizationId);
  if (!membership) throw makeError("You do not belong to this organization.", 403, "ORG_ACCESS_DENIED");
  const organization = await Organization.findById(organizationId);
  if (!organization || organization.status !== "active") throw makeError("Organization is not active.", 403, "ORG_INACTIVE");
  return { organization, membership };
}

async function assertRole(userId, organizationId, roles) {
  const ctx = await assertMembership(userId, organizationId);
  if (!roles.includes(ctx.membership.role)) throw makeError("You do not have permission for this organization action.", 403, "ORG_ROLE_REQUIRED");
  return ctx;
}

async function createOrganization(input = {}, context = {}) {
  const organization = await Organization.create({
    name: input.name,
    slug: input.slug,
    logo: input.logo || "",
    website: input.website || "",
    billingEmail: input.billingEmail || context.actor?.email || "",
    status: input.status || "active",
    ownerId: context.actor._id,
    timezone: input.timezone || "UTC",
    preferences: input.preferences || {},
  });
  await OrganizationMembership.create({
    organizationId: organization._id,
    userId: context.actor._id,
    role: "owner",
    status: "active",
  });
  await User.findByIdAndUpdate(context.actor._id, { activeOrganizationId: organization._id });
  await audit("organization.created", { ...context, organizationId: organization._id });
  await audit("organization.member_added", { ...context, organizationId: organization._id, metadata: { userId: context.actor._id, role: "owner" } });
  return organization;
}

async function listOrganizations(userId) {
  if (!isObjectIdLike(userId)) return [];
  const memberships = await OrganizationMembership.find({ userId, status: "active" }).populate("organizationId").lean();
  return memberships
    .filter((membership) => membership.organizationId)
    .map((membership) => ({ ...membership.organizationId, membershipRole: membership.role, membershipStatus: membership.status }));
}

async function switchOrganization(userId, organizationId, context = {}) {
  const { organization, membership } = await assertMembership(userId, organizationId);
  await User.findByIdAndUpdate(userId, { activeOrganizationId: organizationId });
  await audit("organization.switched", { ...context, organizationId, metadata: { role: membership.role } });
  return { organization, membership };
}

async function inviteMember(organizationId, input = {}, context = {}) {
  await assertRole(context.actor._id, organizationId, MANAGEMENT_ROLES);
  const existing = await OrganizationInvitation.findOne({ organizationId, email: input.email, status: "pending" });
  if (existing) throw makeError("An active invitation already exists for this email.", 409, "ORG_INVITE_DUPLICATE");
  const rawToken = OrganizationInvitation.generateInvitationToken();
  const invitation = await OrganizationInvitation.create({
    organizationId,
    email: input.email,
    role: input.role || "viewer",
    tokenHash: OrganizationInvitation.hashInvitationToken(rawToken),
    invitedBy: context.actor._id,
    expiresAt: input.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await audit("organization.invitation_sent", { ...context, organizationId, targetId: invitation._id, metadata: { email: invitation.email, role: invitation.role } });
  return { invitation, token: rawToken };
}

async function acceptInvitation(rawToken, user, context = {}) {
  const invitation = await OrganizationInvitation.findOne({ tokenHash: OrganizationInvitation.hashInvitationToken(rawToken) }).select("+tokenHash");
  if (!invitation || invitation.status !== "pending") throw makeError("Invitation is not available.", 404, "ORG_INVITE_NOT_FOUND");
  if (invitation.expiresAt < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    throw makeError("Invitation has expired.", 410, "ORG_INVITE_EXPIRED");
  }
  if (invitation.email !== user.email) throw makeError("Invitation email does not match this account.", 403, "ORG_INVITE_EMAIL_MISMATCH");
  const membership = await OrganizationMembership.findOneAndUpdate(
    { organizationId: invitation.organizationId, userId: user._id },
    { organizationId: invitation.organizationId, userId: user._id, role: invitation.role, status: "active", joinedAt: new Date(), invitedBy: invitation.invitedBy },
    { new: true, upsert: true }
  );
  invitation.status = "accepted";
  invitation.acceptedBy = user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  await User.findByIdAndUpdate(user._id, { activeOrganizationId: invitation.organizationId });
  await audit("organization.invitation_accepted", { ...context, actor: user, organizationId: invitation.organizationId, targetId: invitation._id });
  return membership;
}

async function declineInvitation(rawToken, user, context = {}) {
  const invitation = await OrganizationInvitation.findOne({ tokenHash: OrganizationInvitation.hashInvitationToken(rawToken) }).select("+tokenHash");
  if (!invitation || invitation.status !== "pending") throw makeError("Invitation is not available.", 404, "ORG_INVITE_NOT_FOUND");
  if (invitation.email !== user.email) throw makeError("Invitation email does not match this account.", 403, "ORG_INVITE_EMAIL_MISMATCH");
  invitation.status = "declined";
  invitation.declinedAt = new Date();
  await invitation.save();
  await audit("organization.invitation_declined", { ...context, actor: user, organizationId: invitation.organizationId, targetId: invitation._id });
  return invitation;
}

async function updateInvitation(organizationId, invitationId, action, context = {}) {
  await assertRole(context.actor._id, organizationId, MANAGEMENT_ROLES);
  const invitation = await OrganizationInvitation.findOne({ _id: invitationId, organizationId });
  if (!invitation) throw makeError("Invitation not found.", 404, "ORG_INVITE_NOT_FOUND");
  if (action === "cancel") {
    invitation.status = "cancelled";
    invitation.cancelledAt = new Date();
  } else if (action === "resend") {
    invitation.resentAt = new Date();
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  } else {
    throw makeError("Invitation action is invalid.", 422);
  }
  await invitation.save();
  await audit(action === "cancel" ? "organization.invitation_cancelled" : "organization.invitation_resent", { ...context, organizationId, targetId: invitation._id });
  return invitation;
}

async function changeMemberRole(organizationId, userId, role, context = {}) {
  const { organization } = await assertRole(context.actor._id, organizationId, CONTROL_ROLES);
  if (role === "owner") throw makeError("Use transfer ownership to assign owner role.", 422, "ORG_OWNER_TRANSFER_REQUIRED");
  const membership = await OrganizationMembership.findOne({ organizationId, userId, status: { $ne: "removed" } });
  if (!membership) throw makeError("Member not found.", 404, "ORG_MEMBER_NOT_FOUND");
  if (membership.role === "owner") throw makeError("Owner role cannot be changed directly.", 409, "ORG_OWNER_PROTECTED");
  const fromRole = membership.role;
  membership.role = role;
  membership.status = "active";
  await membership.save();
  await audit("organization.role_changed", { ...context, organizationId, metadata: { userId, fromRole, toRole: role } });
  return { organization, membership };
}

async function removeMember(organizationId, userId, context = {}) {
  await assertRole(context.actor._id, organizationId, CONTROL_ROLES);
  const membership = await OrganizationMembership.findOne({ organizationId, userId });
  if (!membership) throw makeError("Member not found.", 404, "ORG_MEMBER_NOT_FOUND");
  if (membership.role === "owner") throw makeError("Transfer ownership before removing the owner.", 409, "ORG_OWNER_PROTECTED");
  membership.status = "removed";
  membership.removedAt = new Date();
  await membership.save();
  await audit("organization.member_removed", { ...context, organizationId, metadata: { userId } });
  return membership;
}

async function suspendMember(organizationId, userId, context = {}) {
  await assertRole(context.actor._id, organizationId, CONTROL_ROLES);
  const membership = await OrganizationMembership.findOne({ organizationId, userId });
  if (!membership) throw makeError("Member not found.", 404, "ORG_MEMBER_NOT_FOUND");
  if (membership.role === "owner") throw makeError("Owner cannot be suspended.", 409, "ORG_OWNER_PROTECTED");
  membership.status = "suspended";
  membership.suspendedAt = new Date();
  await membership.save();
  await audit("organization.member_suspended", { ...context, organizationId, metadata: { userId } });
  return membership;
}

async function transferOwnership(organizationId, newOwnerId, context = {}) {
  const { organization } = await assertRole(context.actor._id, organizationId, ["owner"]);
  const nextOwner = await OrganizationMembership.findOne({ organizationId, userId: newOwnerId, status: "active" });
  if (!nextOwner) throw makeError("New owner must be an active organization member.", 404, "ORG_MEMBER_NOT_FOUND");
  const previousOwner = await OrganizationMembership.findOne({ organizationId, userId: organization.ownerId });
  if (previousOwner) {
    previousOwner.role = "admin";
    await previousOwner.save();
  }
  nextOwner.role = "owner";
  await nextOwner.save();
  const previousOwnerId = organization.ownerId;
  organization.ownerId = newOwnerId;
  await organization.save();
  await audit("organization.ownership_changed", { ...context, organizationId, metadata: { previousOwnerId, newOwnerId } });
  return organization;
}

async function updateSettings(organizationId, updates = {}, context = {}) {
  await assertRole(context.actor._id, organizationId, CONTROL_ROLES);
  const allowed = ["name", "logo", "website", "billingEmail", "timezone", "preferences", "branding"];
  const patch = {};
  allowed.forEach((field) => {
    if (updates[field] !== undefined) patch[field] = updates[field];
  });
  const organization = await Organization.findByIdAndUpdate(organizationId, patch, { new: true, runValidators: true });
  await audit("organization.settings_updated", { ...context, organizationId, metadata: { fields: Object.keys(patch) } });
  return organization;
}

async function dashboard(organizationId, context = {}) {
  await assertMembership(context.actor._id, organizationId);
  const [organization, members, invitations, licenses, orders, downloads, domains] = await Promise.all([
    Organization.findById(organizationId),
    OrganizationMembership.find({ organizationId, status: { $ne: "removed" } }).populate("userId", "name email role").lean(),
    OrganizationInvitation.find({ organizationId, status: "pending" }).select("-tokenHash").lean(),
    License.countDocuments({ organizationId }),
    Order.countDocuments({ organizationId }),
    Download.countDocuments({ organizationId }),
    LicenseSite.countDocuments({ organizationId }),
  ]);
  return {
    organization,
    members,
    invitations,
    summary: { members: members.length, pendingInvitations: invitations.length, licenses, orders, downloads, domains },
  };
}

module.exports = {
  CONTROL_ROLES,
  MANAGEMENT_ROLES,
  assertMembership,
  assertRole,
  createOrganization,
  listOrganizations,
  switchOrganization,
  inviteMember,
  acceptInvitation,
  declineInvitation,
  updateInvitation,
  changeMemberRole,
  removeMember,
  suspendMember,
  transferOwnership,
  updateSettings,
  dashboard,
};
