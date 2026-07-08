const asyncHandler = require("express-async-handler");
const OrganizationService = require("../services/organizationService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.listOrganizations = asyncHandler(async (req, res) => {
  const data = await OrganizationService.listOrganizations(req.user._id);
  res.json({ success: true, data });
});

exports.createOrganization = asyncHandler(async (req, res) => {
  const organization = await OrganizationService.createOrganization(req.body, context(req));
  res.status(201).json({ success: true, message: "Organization created.", data: organization });
});

exports.switchOrganization = asyncHandler(async (req, res) => {
  const data = await OrganizationService.switchOrganization(req.user._id, req.params.organizationId, context(req));
  res.json({ success: true, message: "Organization switched.", data });
});

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await OrganizationService.dashboard(req.params.organizationId, context(req));
  res.json({ success: true, data });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const organization = await OrganizationService.updateSettings(req.params.organizationId, req.body, context(req));
  res.json({ success: true, message: "Organization updated.", data: organization });
});

exports.inviteMember = asyncHandler(async (req, res) => {
  const result = await OrganizationService.inviteMember(req.params.organizationId, req.body, context(req));
  res.status(201).json({ success: true, message: "Invitation sent.", data: result });
});

exports.acceptInvitation = asyncHandler(async (req, res) => {
  const membership = await OrganizationService.acceptInvitation(req.body.token, req.user, context(req));
  res.json({ success: true, message: "Invitation accepted.", data: membership });
});

exports.declineInvitation = asyncHandler(async (req, res) => {
  const invitation = await OrganizationService.declineInvitation(req.body.token, req.user, context(req));
  res.json({ success: true, message: "Invitation declined.", data: invitation });
});

exports.invitationAction = asyncHandler(async (req, res) => {
  const invitation = await OrganizationService.updateInvitation(req.params.organizationId, req.params.invitationId, req.params.action, context(req));
  res.json({ success: true, message: "Invitation updated.", data: invitation });
});

exports.changeRole = asyncHandler(async (req, res) => {
  const result = await OrganizationService.changeMemberRole(req.params.organizationId, req.params.userId, req.body.role, context(req));
  res.json({ success: true, message: "Member role updated.", data: result });
});

exports.removeMember = asyncHandler(async (req, res) => {
  const membership = await OrganizationService.removeMember(req.params.organizationId, req.params.userId, context(req));
  res.json({ success: true, message: "Member removed.", data: membership });
});

exports.suspendMember = asyncHandler(async (req, res) => {
  const membership = await OrganizationService.suspendMember(req.params.organizationId, req.params.userId, context(req));
  res.json({ success: true, message: "Member suspended.", data: membership });
});

exports.transferOwnership = asyncHandler(async (req, res) => {
  const organization = await OrganizationService.transferOwnership(req.params.organizationId, req.body.userId, context(req));
  res.json({ success: true, message: "Ownership transferred.", data: organization });
});
