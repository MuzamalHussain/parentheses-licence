const mongoose = require("mongoose");

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    logo: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    billingEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid billing email format"],
    },
    status: {
      type: String,
      enum: ["active", "suspended", "archived", "pending"],
      default: "active",
      index: true,
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    timezone: { type: String, trim: true, default: "UTC", maxlength: 80 },
    preferences: { type: Object, default: {} },
    branding: {
      primaryColor: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

organizationSchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (this.slug) this.slug = slugify(this.slug);
  next();
});

organizationSchema.index({ ownerId: 1, status: 1 });
organizationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Organization", organizationSchema);
module.exports.slugifyOrganization = slugify;
