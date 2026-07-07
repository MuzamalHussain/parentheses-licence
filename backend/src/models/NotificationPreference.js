const mongoose = require("mongoose");

const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    productUpdates: { type: Boolean, default: true },
    renewalReminders: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    securityAlerts: { type: Boolean, default: true },
    supportNotifications: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NotificationPreference", notificationPreferenceSchema);
