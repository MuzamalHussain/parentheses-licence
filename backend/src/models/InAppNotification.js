const mongoose = require("mongoose");

const inAppNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, default: "", maxlength: 2000 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

inAppNotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
inAppNotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("InAppNotification", inAppNotificationSchema);
