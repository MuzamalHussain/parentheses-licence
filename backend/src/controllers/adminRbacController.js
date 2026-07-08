const asyncHandler = require("express-async-handler");
const RbacService = require("../services/rbac/RbacService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

exports.overview = asyncHandler(async (req, res) => {
  const data = await RbacService.overview(orgId(req), context(req));
  res.json({ success: true, data });
});

exports.createTeam = asyncHandler(async (req, res) => {
  const data = await RbacService.createTeam(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "Team created.", data });
});

exports.updateTeam = asyncHandler(async (req, res) => {
  const data = await RbacService.updateTeam(orgId(req), req.params.teamId, req.body, context(req));
  res.json({ success: true, message: "Team updated.", data });
});

exports.archiveTeam = asyncHandler(async (req, res) => {
  const data = await RbacService.archiveTeam(orgId(req), req.params.teamId, context(req));
  res.json({ success: true, message: "Team archived.", data });
});

exports.deleteTeam = asyncHandler(async (req, res) => {
  const data = await RbacService.deleteTeam(orgId(req), req.params.teamId, context(req));
  res.json({ success: true, message: "Team deleted.", data });
});

exports.assignTeamMember = asyncHandler(async (req, res) => {
  const data = await RbacService.assignTeamMember(orgId(req), req.params.teamId, req.body.userId, context(req));
  res.json({ success: true, message: "Member assigned.", data });
});

exports.removeTeamMember = asyncHandler(async (req, res) => {
  const data = await RbacService.removeTeamMember(orgId(req), req.params.teamId, req.params.userId, context(req));
  res.json({ success: true, message: "Member removed.", data });
});

exports.createRole = asyncHandler(async (req, res) => {
  const data = await RbacService.createRole(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "Role created.", data });
});

exports.cloneRole = asyncHandler(async (req, res) => {
  const data = await RbacService.cloneRole(orgId(req), req.params.roleId, req.body, context(req));
  res.status(201).json({ success: true, message: "Role cloned.", data });
});

exports.updateRole = asyncHandler(async (req, res) => {
  const data = await RbacService.updateRole(orgId(req), req.params.roleId, req.body, context(req));
  res.json({ success: true, message: "Role updated.", data });
});

exports.archiveRole = asyncHandler(async (req, res) => {
  const data = await RbacService.archiveRole(orgId(req), req.params.roleId, context(req));
  res.json({ success: true, message: "Role archived.", data });
});

exports.deleteRole = asyncHandler(async (req, res) => {
  const data = await RbacService.deleteRole(orgId(req), req.params.roleId, context(req));
  res.json({ success: true, message: "Role deleted.", data });
});

exports.assignRole = asyncHandler(async (req, res) => {
  const data = await RbacService.assignRoleToMember(orgId(req), req.params.userId, req.body.roleId, context(req));
  res.json({ success: true, message: "Role assigned.", data });
});

exports.removeRole = asyncHandler(async (req, res) => {
  const data = await RbacService.removeRoleFromMember(orgId(req), req.params.userId, req.params.roleId, context(req));
  res.json({ success: true, message: "Role removed.", data });
});

exports.resolvedPermissions = asyncHandler(async (req, res) => {
  const data = await RbacService.resolvedPermissions(orgId(req), req.params.userId, context(req));
  res.json({ success: true, data });
});
