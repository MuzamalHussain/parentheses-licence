const AuditLog = require("../models/AuditLog");

/**
 * Write an audit log entry.
 * Non-blocking — failures are logged to console, never thrown.
 *
 * @param {object} opts
 * @param {object|null} opts.actor   - req.user object (or null for system)
 * @param {string}      opts.action  - e.g. "license.created", "license.suspended"
 * @param {string}      opts.targetType - "License" | "User" | "Product" | ""
 * @param {*}           opts.targetId
 * @param {object}      opts.metadata - any extra data to store
 * @param {string}      opts.ip       - request IP
 */
async function writeAuditLog({ actor = null, action, targetType = "", targetId = null, metadata = {}, ip = "" }) {
  try {
    await AuditLog.create({
      actorId:    actor?._id   || null,
      actorRole:  actor?.role  || "system",
      actorEmail: actor?.email || "",
      action,
      targetType,
      targetId,
      metadata,
      ipAddress: ip,
    });
  } catch (err) {
    console.error("[AuditLog] Write failed:", err.message);
  }
}

module.exports = { writeAuditLog };
