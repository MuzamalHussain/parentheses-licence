const OrganizationService = require("../organizationService");
const Resolver = require("../rbac/PermissionResolver");
const { AppError } = require("../../utils/errorHandler");

async function can(actor, organizationId, permission) {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  if (permission === "ai.use") return true;
  if (!organizationId) return false;
  await OrganizationService.assertMembership(actor._id, organizationId);
  const resolved = await Resolver.resolve(actor._id, organizationId);
  return resolved.permissions.includes(permission) || resolved.permissions.includes("ai.admin");
}

async function assert(actor, organizationId, permission) {
  if (!(await can(actor, organizationId, permission))) {
    throw new AppError("You do not have permission to manage AI platform resources.", 403);
  }
  return true;
}

module.exports = { assert, can };
