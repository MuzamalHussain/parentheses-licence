const mongoose = require("mongoose");
const ruleSchema = new mongoose.Schema({ environment: { type: String, required: true }, enabled: { type: Boolean, required: true } }, { _id: false });
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, match: /^[a-z][a-z0-9_.-]{2,119}$/ }, name: { type: String, required: true, trim: true }, description: { type: String, default: "" },
  category: { type: String, required: true, enum: ["core", "licensing", "payments", "email", "ai", "storage", "security", "downloads", "plugin_updates", "reports", "admin_tools", "developer_tools", "experimental", "maintenance", "future_modules"] },
  experimentalGroup: { type: String, enum: ["", "beta", "internal", "preview", "labs", "hidden"], default: "" }, enabled: { type: Boolean, default: false }, defaultValue: { type: Boolean, default: false }, rolloutPercentage: { type: Number, min: 0, max: 100, default: 100 },
  environmentRules: { type: [ruleSchema], default: [] }, allowedRoles: { type: [String], default: [] }, allowedUserIds: { type: [String], default: [] }, allowedPlans: { type: [String], default: [] }, dependencies: { type: [String], default: [] },
  scheduledActivation: { type: Date, default: null }, scheduledExpiration: { type: Date, default: null }, emergencyKillSwitch: { type: Boolean, default: false }, metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
schema.index({ category: 1, enabled: 1 }); schema.index({ updatedAt: -1 });
module.exports = mongoose.model("FeatureFlag", schema);
