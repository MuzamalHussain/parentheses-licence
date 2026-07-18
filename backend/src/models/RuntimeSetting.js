const mongoose = require("mongoose");
const schema = new mongoose.Schema({ key: { type: String, required: true, unique: true, index: true }, group: { type: String, required: true, index: true }, value: { type: mongoose.Schema.Types.Mixed, default: null }, encryptedValue: { type: mongoose.Schema.Types.Mixed, default: null, select: false }, encrypted: { type: Boolean, default: false }, version: { type: Number, default: 1, min: 1 }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, metadata: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true, collection: "runtime_settings" });
schema.index({ group: 1, updatedAt: -1 });
module.exports = mongoose.model("RuntimeSetting", schema);
