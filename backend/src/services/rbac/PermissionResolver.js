const OrganizationMembership = require("../../models/OrganizationMembership");
const OrganizationRole = require("../../models/OrganizationRole");
const OrganizationTeam = require("../../models/OrganizationTeam");
const Registry = require("./PermissionRegistry");
const Cache = require("./PermissionCache");

const BUILT_IN_ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: ["*"],
  manager: ["organization.read", "members.read", "members.create", "members.update", "products.*", "versions.*", "licenses.*", "downloads.*", "analytics.read"],
  developer: ["organization.read", "products.read", "versions.read", "downloads.read", "api.read", "webhooks.read", "developer_portal.read"],
  support: ["organization.read", "members.read", "licenses.read", "downloads.read", "notifications.read", "orders.read"],
  finance: ["organization.read", "orders.*", "payments.*", "analytics.read", "licenses.read"],
  viewer: ["organization.read", "products.read", "versions.read", "licenses.read", "orders.read", "downloads.read"],
};

function normalizePermissionList(list = []) {
  return Registry.expand(list);
}

async function resolve(userId, organizationId, options = {}) {
  if (!options.skipCache) {
    const cached = Cache.get(userId, organizationId);
    if (cached) return cached;
  }

  const membership = await OrganizationMembership.findOne({ userId, organizationId, status: "active" }).lean();
  if (!membership) {
    return Cache.set(userId, organizationId, { permissions: [], sources: [], membership: null });
  }

  const permissionSet = new Set(normalizePermissionList(BUILT_IN_ROLE_PERMISSIONS[membership.role] || []));
  const sources = [{ type: "membership_role", id: membership.role }];

  const roleIds = [...new Set([...(membership.roleIds || [])].map(String))];
  const teamIds = [...new Set([...(membership.teamIds || [])].map(String))];

  const [directRoles, teams] = await Promise.all([
    roleIds.length ? OrganizationRole.find({ _id: { $in: roleIds }, organizationId, status: "active" }).lean() : [],
    teamIds.length ? OrganizationTeam.find({ _id: { $in: teamIds }, organizationId, status: "active" }).lean() : [],
  ]);

  const teamRoleIds = [...new Set(teams.flatMap((team) => team.roleIds || []).map(String))];
  const teamRoles = teamRoleIds.length
    ? await OrganizationRole.find({ _id: { $in: teamRoleIds }, organizationId, status: "active" }).lean()
    : [];

  [...directRoles, ...teamRoles].forEach((role) => {
    normalizePermissionList(role.permissions || []).forEach((permission) => permissionSet.add(permission));
    sources.push({ type: "custom_role", id: role._id, slug: role.slug });
  });

  normalizePermissionList(membership.permissionOverrides?.allow || []).forEach((permission) => permissionSet.add(permission));
  normalizePermissionList(membership.permissionOverrides?.deny || []).forEach((permission) => permissionSet.delete(permission));

  return Cache.set(userId, organizationId, {
    permissions: [...permissionSet].sort(),
    sources,
    membership,
  });
}

async function hasPermission(userId, organizationId, permission) {
  const resolved = await resolve(userId, organizationId);
  return resolved.permissions.includes(permission);
}

module.exports = { BUILT_IN_ROLE_PERMISSIONS, resolve, hasPermission, normalizePermissionList };
