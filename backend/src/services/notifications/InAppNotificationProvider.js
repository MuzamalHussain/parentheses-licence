const NotificationProviderInterface = require("./NotificationProviderInterface");
const InAppNotification = require("../../models/InAppNotification");

class InAppNotificationProvider extends NotificationProviderInterface {
  constructor() {
    super("in_app", "in_app");
  }

  async send(message) {
    if (!message.userId) return { success: false, skipped: true, reason: "missing_user" };
    const doc = await InAppNotification.create({
      userId: message.userId,
      type: message.type,
      title: message.title || message.subject || "Notification",
      body: message.body || message.text || "",
      data: message.data || {},
    });
    return { success: true, provider: this.name, notificationId: doc._id };
  }
}

module.exports = InAppNotificationProvider;
