const NotificationPreference = require("../../models/NotificationPreference");

const EVENT_CATEGORIES = {
  downloadReady: "productUpdates",
  newVersionAvailable: "productUpdates",
  criticalSecurityRelease: "securityAlerts",
  licenseExpiring: "renewalReminders",
  licenseRenewed: "renewalReminders",
  subscriptionRenewed: "renewalReminders",
  ticketCreated: "supportNotifications",
  replyAdded: "supportNotifications",
  ticketClosed: "supportNotifications",
  marketing: "marketingEmails",
};

const REQUIRED_EVENTS = new Set(["verifyEmail", "passwordReset", "passwordChanged", "criticalSecurityRelease", "licenseRevoked", "licenseSuspended"]);

async function getPreferences(userId) {
  if (!userId) return null;
  let prefs = await NotificationPreference.findOne({ userId }).lean();
  if (!prefs) {
    prefs = await NotificationPreference.create({ userId });
    prefs = prefs.toObject ? prefs.toObject() : prefs;
  }
  return prefs;
}

async function updatePreferences(userId, updates = {}) {
  const allowed = ["productUpdates", "renewalReminders", "marketingEmails", "securityAlerts", "supportNotifications"];
  const $set = {};
  for (const key of allowed) {
    if (typeof updates[key] === "boolean") $set[key] = updates[key];
  }
  return NotificationPreference.findOneAndUpdate({ userId }, { $set }, { new: true, upsert: true, runValidators: true });
}

async function isAllowed(userId, type) {
  if (!userId || REQUIRED_EVENTS.has(type)) return true;
  const category = EVENT_CATEGORIES[type];
  if (!category) return true;
  const prefs = await getPreferences(userId);
  return prefs?.[category] !== false;
}

module.exports = {
  EVENT_CATEGORIES,
  REQUIRED_EVENTS,
  getPreferences,
  updatePreferences,
  isAllowed,
};
