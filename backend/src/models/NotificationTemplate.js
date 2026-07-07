const mongoose = require("mongoose");

const notificationTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    channel: { type: String, enum: ["email", "in_app"], default: "email", index: true },
    subject: { type: String, default: "", maxlength: 250 },
    htmlBody: { type: String, default: "", maxlength: 20000 },
    textBody: { type: String, default: "", maxlength: 20000 },
    variables: { type: [String], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

notificationTemplateSchema.index({ channel: 1, enabled: 1 });

module.exports = mongoose.model("NotificationTemplate", notificationTemplateSchema);
