const mongoose = require("mongoose");

const ORGANIZATION_ROLES = ["owner", "admin", "manager", "developer", "support", "finance", "viewer"];

const organizationMembershipSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ORGANIZATION_ROLES, default: "viewer", index: true },
    status: { type: String, enum: ["active", "suspended", "removed"], default: "active", index: true },
    teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "OrganizationTeam", default: [] }],
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "OrganizationRole", default: [] }],
    permissionOverrides: {
      allow: { type: [String], default: [] },
      deny: { type: [String], default: [] },
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    joinedAt: { type: Date, default: Date.now },
    suspendedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
organizationMembershipSchema.index({ userId: 1, status: 1 });
organizationMembershipSchema.index({ organizationId: 1, role: 1, status: 1 });
organizationMembershipSchema.index({ organizationId: 1, teamIds: 1 });
organizationMembershipSchema.index({ organizationId: 1, roleIds: 1 });

module.exports = mongoose.model("OrganizationMembership", organizationMembershipSchema);
module.exports.ORGANIZATION_ROLES = ORGANIZATION_ROLES;
