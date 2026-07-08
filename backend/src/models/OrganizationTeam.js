const mongoose = require("mongoose");

const DEFAULT_TEAMS = ["Engineering", "Finance", "Support", "Sales", "Marketing", "QA", "Operations"];

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const organizationTeamSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    status: { type: String, enum: ["active", "archived", "deleted"], default: "active", index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "OrganizationRole", default: [] }],
    isDefault: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationTeamSchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (this.slug) this.slug = slugify(this.slug);
  next();
});

organizationTeamSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
organizationTeamSchema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = mongoose.model("OrganizationTeam", organizationTeamSchema);
module.exports.DEFAULT_TEAMS = DEFAULT_TEAMS;
module.exports.slugifyTeam = slugify;
