const crypto = require("crypto");
const mongoose = require("mongoose");

const INVITATION_ROLES = ["admin", "manager", "developer", "support", "finance", "viewer"];

const organizationInvitationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"],
      index: true,
    },
    role: { type: String, enum: INVITATION_ROLES, default: "viewer" },
    tokenHash: { type: String, required: true, unique: true, select: false },
    status: { type: String, enum: ["pending", "accepted", "declined", "cancelled", "expired"], default: "pending", index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    resentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationInvitationSchema.index({ organizationId: 1, email: 1, status: 1 });

function hashInvitationToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function generateInvitationToken() {
  return `org_inv_${crypto.randomBytes(32).toString("base64url")}`;
}

module.exports = mongoose.model("OrganizationInvitation", organizationInvitationSchema);
module.exports.INVITATION_ROLES = INVITATION_ROLES;
module.exports.hashInvitationToken = hashInvitationToken;
module.exports.generateInvitationToken = generateInvitationToken;
