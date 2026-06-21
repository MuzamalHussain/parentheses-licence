const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    group: {
      type: String,
      required: true,
      enum: ["General", "Licensing", "Downloads", "Payments", "Email", "Security", "WordPress Updater", "Maintenance"],
    },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    type: { type: String, required: true, enum: ["string", "number", "boolean", "json"] },
    isSecret: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: false },
    isEditable: { type: Boolean, default: true },
    isReserved: { type: Boolean, default: true },
    reservedFor: { type: String, default: "" },
    envKey: { type: String, default: "" },
    description: { type: String, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

settingSchema.index({ group: 1, key: 1 });

module.exports = mongoose.model("Setting", settingSchema);
