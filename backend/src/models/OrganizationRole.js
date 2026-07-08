const mongoose = require("mongoose");

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const organizationRoleSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ["active", "archived", "deleted"], default: "active", index: true },
    isSystem: { type: Boolean, default: false },
    clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationRole", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationRoleSchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (this.slug) this.slug = slugify(this.slug);
  next();
});

organizationRoleSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
organizationRoleSchema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = mongoose.model("OrganizationRole", organizationRoleSchema);
module.exports.slugifyRole = slugify;
