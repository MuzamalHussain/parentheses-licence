const OrganizationMembership = require("../../models/OrganizationMembership");
const OrganizationRole = require("../../models/OrganizationRole");
const OrganizationTeam = require("../../models/OrganizationTeam");
const OrganizationService = require("../organizationService");
const Registry = require("./PermissionRegistry");
const Resolver = require("./PermissionResolver");
const Cache = require("./PermissionCache");
const { writeAuditLog } = require("../../utils/auditLog");

function makeError(message, statusCode = 422, code = "RBAC_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

async function audit(action, { actor, organizationId, targetId = null, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({ actor, action, targetType: "RBAC", targetId: targetId || organizationId, metadata: { organizationId, ...metadata }, ip, requestId });
}

async function assertManage(actor, organizationId) {
  const ctx = await OrganizationService.assertMembership(actor._id, organizationId);
  const allowed = await Resolver.hasPermission(actor._id, organizationId, "settings.manage");
  if (!allowed) throw makeError("You do not have permission to manage organization access.", 403, "RBAC_MANAGE_REQUIRED");
  return ctx;
}

async function validateAssignablePermissions(actor, organizationId, permissions = []) {
  const normalized = Resolver.normalizePermissionList(permissions);
  if (normalized.length !== permissions.length && permissions.some((item) => item !== "*" && !item.endsWith(".*"))) {
    throw makeError("One or more permissions are invalid.", 422, "RBAC_INVALID_PERMISSION");
  }
  const actorPermissions = (await Resolver.resolve(actor._id, organizationId)).permissions;
  const canGrantAll = actorPermissions.length === Registry.allKeys().length;
  if (!canGrantAll && normalized.some((permission) => !actorPermissions.includes(permission))) {
    throw makeError("Cannot grant permissions you do not have.", 403, "RBAC_PRIVILEGE_ESCALATION");
  }
  return normalized;
}

async function ensureDefaultTeams(organizationId, actor) {
  const existing = await OrganizationTeam.find({ organizationId, status: { $ne: "deleted" } }).lean();
  const existingNames = new Set(existing.map((team) => team.name));
  const created = [];
  for (const name of OrganizationTeam.DEFAULT_TEAMS) {
    if (existingNames.has(name)) continue;
    created.push(await OrganizationTeam.create({ organizationId, name, ownerId: actor._id, isDefault: true }));
  }
  return created;
}

async function overview(organizationId, context = {}) {
  await OrganizationService.assertMembership(context.actor._id, organizationId);
  await ensureDefaultTeams(organizationId, context.actor);
  const [teams, roles, members] = await Promise.all([
    OrganizationTeam.find({ organizationId, status: { $ne: "deleted" } }).sort({ name: 1 }).lean(),
    OrganizationRole.find({ organizationId, status: { $ne: "deleted" } }).sort({ name: 1 }).lean(),
    OrganizationMembership.find({ organizationId, status: { $ne: "removed" } }).populate("userId", "name email role").lean(),
  ]);
  return {
    teams,
    roles,
    members,
    permissions: Registry.permissions,
    matrix: Registry.RESOURCES.map((resource) => ({
      resource,
      actions: Registry.ACTIONS.map((action) => `${resource}.${action}`),
    })),
  };
}

async function createTeam(organizationId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const team = await OrganizationTeam.create({
    organizationId,
    name: input.name,
    description: input.description || "",
    ownerId: input.ownerId || context.actor._id,
    memberIds: input.memberIds || [],
    roleIds: input.roleIds || [],
  });
  await audit("rbac.team_created", { ...context, organizationId, targetId: team._id, metadata: { name: team.name } });
  return team;
}

async function updateTeam(organizationId, teamId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const team = await OrganizationTeam.findOne({ _id: teamId, organizationId, status: { $ne: "deleted" } });
  if (!team) throw makeError("Team not found.", 404, "RBAC_TEAM_NOT_FOUND");
  if (input.name !== undefined) team.name = input.name;
  if (input.description !== undefined) team.description = input.description;
  if (input.ownerId !== undefined) team.ownerId = input.ownerId;
  if (input.roleIds !== undefined) team.roleIds = input.roleIds;
  await team.save();
  await audit("rbac.team_updated", { ...context, organizationId, targetId: team._id });
  return team;
}

async function archiveTeam(organizationId, teamId, context = {}) {
  await assertManage(context.actor, organizationId);
  const team = await OrganizationTeam.findOne({ _id: teamId, organizationId });
  if (!team) throw makeError("Team not found.", 404, "RBAC_TEAM_NOT_FOUND");
  team.status = "archived";
  team.archivedAt = new Date();
  await team.save();
  await audit("rbac.team_archived", { ...context, organizationId, targetId: team._id });
  return team;
}

async function deleteTeam(organizationId, teamId, context = {}) {
  await assertManage(context.actor, organizationId);
  const team = await OrganizationTeam.findOne({ _id: teamId, organizationId });
  if (!team) throw makeError("Team not found.", 404, "RBAC_TEAM_NOT_FOUND");
  team.status = "deleted";
  team.deletedAt = new Date();
  await team.save();
  await OrganizationMembership.updateMany({ organizationId }, { $pull: { teamIds: team._id } });
  Cache.invalidate();
  await audit("rbac.team_deleted", { ...context, organizationId, targetId: team._id });
  return team;
}

async function assignTeamMember(organizationId, teamId, userId, context = {}) {
  await assertManage(context.actor, organizationId);
  const [team, membership] = await Promise.all([
    OrganizationTeam.findOne({ _id: teamId, organizationId, status: "active" }),
    OrganizationMembership.findOne({ organizationId, userId, status: "active" }),
  ]);
  if (!team) throw makeError("Team not found.", 404, "RBAC_TEAM_NOT_FOUND");
  if (!membership) throw makeError("Member not found.", 404, "RBAC_MEMBER_NOT_FOUND");
  if (!team.memberIds.map(String).includes(String(userId))) team.memberIds.push(userId);
  if (!membership.teamIds.map(String).includes(String(team._id))) membership.teamIds.push(team._id);
  await Promise.all([team.save(), membership.save()]);
  Cache.invalidate(userId, organizationId);
  await audit("rbac.member_assigned_to_team", { ...context, organizationId, targetId: team._id, metadata: { userId } });
  return { team, membership };
}

async function removeTeamMember(organizationId, teamId, userId, context = {}) {
  await assertManage(context.actor, organizationId);
  const [team, membership] = await Promise.all([
    OrganizationTeam.findOne({ _id: teamId, organizationId }),
    OrganizationMembership.findOne({ organizationId, userId }),
  ]);
  if (!team || !membership) throw makeError("Team or member not found.", 404, "RBAC_ASSIGNMENT_NOT_FOUND");
  team.memberIds = (team.memberIds || []).filter((id) => String(id) !== String(userId));
  membership.teamIds = (membership.teamIds || []).filter((id) => String(id) !== String(team._id));
  await Promise.all([team.save(), membership.save()]);
  Cache.invalidate(userId, organizationId);
  await audit("rbac.member_removed_from_team", { ...context, organizationId, targetId: team._id, metadata: { userId } });
  return { team, membership };
}

async function createRole(organizationId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const permissions = await validateAssignablePermissions(context.actor, organizationId, input.permissions || []);
  const role = await OrganizationRole.create({
    organizationId,
    name: input.name,
    description: input.description || "",
    permissions,
    createdBy: context.actor._id,
  });
  await audit("rbac.role_created", { ...context, organizationId, targetId: role._id, metadata: { name: role.name, permissions } });
  return role;
}

async function cloneRole(organizationId, roleId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const source = await OrganizationRole.findOne({ _id: roleId, organizationId, status: "active" }).lean();
  if (!source) throw makeError("Role not found.", 404, "RBAC_ROLE_NOT_FOUND");
  return createRole(organizationId, {
    name: input.name || `${source.name} Copy`,
    description: input.description || source.description,
    permissions: source.permissions,
    clonedFrom: source._id,
  }, context);
}

async function updateRole(organizationId, roleId, input = {}, context = {}) {
  await assertManage(context.actor, organizationId);
  const role = await OrganizationRole.findOne({ _id: roleId, organizationId, status: { $ne: "deleted" } });
  if (!role) throw makeError("Role not found.", 404, "RBAC_ROLE_NOT_FOUND");
  if (role.isSystem && input.permissions) throw makeError("System role permissions cannot be changed.", 409, "RBAC_SYSTEM_ROLE_PROTECTED");
  if (input.name !== undefined) role.name = input.name;
  if (input.description !== undefined) role.description = input.description;
  if (input.permissions !== undefined) role.permissions = await validateAssignablePermissions(context.actor, organizationId, input.permissions);
  await role.save();
  Cache.invalidate();
  await audit("rbac.role_updated", { ...context, organizationId, targetId: role._id, metadata: { permissions: role.permissions } });
  return role;
}

async function archiveRole(organizationId, roleId, context = {}) {
  await assertManage(context.actor, organizationId);
  const role = await OrganizationRole.findOne({ _id: roleId, organizationId });
  if (!role) throw makeError("Role not found.", 404, "RBAC_ROLE_NOT_FOUND");
  if (role.isSystem) throw makeError("System roles cannot be archived.", 409, "RBAC_SYSTEM_ROLE_PROTECTED");
  role.status = "archived";
  role.archivedAt = new Date();
  await role.save();
  Cache.invalidate();
  await audit("rbac.role_archived", { ...context, organizationId, targetId: role._id });
  return role;
}

async function deleteRole(organizationId, roleId, context = {}) {
  await assertManage(context.actor, organizationId);
  const role = await OrganizationRole.findOne({ _id: roleId, organizationId });
  if (!role) throw makeError("Role not found.", 404, "RBAC_ROLE_NOT_FOUND");
  if (role.isSystem) throw makeError("System roles cannot be deleted.", 409, "RBAC_SYSTEM_ROLE_PROTECTED");
  role.status = "deleted";
  role.deletedAt = new Date();
  await role.save();
  await Promise.all([
    OrganizationMembership.updateMany({ organizationId }, { $pull: { roleIds: role._id } }),
    OrganizationTeam.updateMany({ organizationId }, { $pull: { roleIds: role._id } }),
  ]);
  Cache.invalidate();
  await audit("rbac.role_deleted", { ...context, organizationId, targetId: role._id });
  return role;
}

async function assignRoleToMember(organizationId, userId, roleId, context = {}) {
  await assertManage(context.actor, organizationId);
  const [role, membership] = await Promise.all([
    OrganizationRole.findOne({ _id: roleId, organizationId, status: "active" }).lean(),
    OrganizationMembership.findOne({ organizationId, userId, status: "active" }),
  ]);
  if (!role || !membership) throw makeError("Role or member not found.", 404, "RBAC_ASSIGNMENT_NOT_FOUND");
  await validateAssignablePermissions(context.actor, organizationId, role.permissions || []);
  if (!membership.roleIds.map(String).includes(String(roleId))) membership.roleIds.push(roleId);
  await membership.save();
  Cache.invalidate(userId, organizationId);
  await audit("rbac.role_assigned", { ...context, organizationId, targetId: roleId, metadata: { userId } });
  return membership;
}

async function removeRoleFromMember(organizationId, userId, roleId, context = {}) {
  await assertManage(context.actor, organizationId);
  const membership = await OrganizationMembership.findOne({ organizationId, userId });
  if (!membership) throw makeError("Member not found.", 404, "RBAC_MEMBER_NOT_FOUND");
  membership.roleIds = (membership.roleIds || []).filter((id) => String(id) !== String(roleId));
  await membership.save();
  Cache.invalidate(userId, organizationId);
  await audit("rbac.role_removed", { ...context, organizationId, targetId: roleId, metadata: { userId } });
  return membership;
}

async function resolvedPermissions(organizationId, userId, context = {}) {
  await OrganizationService.assertMembership(context.actor._id, organizationId);
  return Resolver.resolve(userId, organizationId, { skipCache: true });
}

module.exports = {
  overview,
  createTeam,
  updateTeam,
  archiveTeam,
  deleteTeam,
  assignTeamMember,
  removeTeamMember,
  createRole,
  cloneRole,
  updateRole,
  archiveRole,
  deleteRole,
  assignRoleToMember,
  removeRoleFromMember,
  resolvedPermissions,
};
