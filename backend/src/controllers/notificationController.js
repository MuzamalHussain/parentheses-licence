const asyncHandler = require("express-async-handler");
const InAppNotification = require("../models/InAppNotification");
const PreferenceService = require("../services/notifications/NotificationPreferenceService");
const { getPagination, paginationMeta } = require("../utils/pagination");

exports.getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.user._id };
  if (req.query.unread === "true") filter.readAt = null;

  const [notifications, total] = await Promise.all([
    InAppNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    InAppNotification.countDocuments(filter),
  ]);

  res.json({ success: true, data: notifications, pagination: paginationMeta({ page, limit, total }) });
});

exports.markRead = asyncHandler(async (req, res) => {
  const notification = await InAppNotification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
  res.json({ success: true, data: notification });
});

exports.getPreferences = asyncHandler(async (req, res) => {
  const preferences = await PreferenceService.getPreferences(req.user._id);
  res.json({ success: true, data: preferences });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const preferences = await PreferenceService.updatePreferences(req.user._id, req.body);
  res.json({ success: true, message: "Notification preferences updated.", data: preferences });
});
