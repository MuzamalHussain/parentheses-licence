const observabilityConfig = require("../config/observability");
const { logWarn } = require("../utils/logger");

async function sendAlert({ severity = "warning", title, message, metadata = {} }) {
  const alert = {
    severity,
    title,
    message,
    metadata,
    channels: observabilityConfig.alerts.channels,
  };

  if (!observabilityConfig.alerts.enabled) {
    logWarn("alert.skipped", { ...alert, reason: "alerts_disabled" });
    return { success: false, skipped: true, reason: "alerts_disabled" };
  }

  logWarn("alert.dispatch_requested", alert);
  return { success: true, queued: true };
}

module.exports = { sendAlert };
