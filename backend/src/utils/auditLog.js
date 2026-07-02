const AuditLog = require("../models/AuditLog");
const { logWarn, logError } = require("./logger");
const mongoose = require("mongoose");

function objectIdOrNull(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

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
 * @param {object}      opts.session  - optional MongoDB transaction session
 */
async function writeAuditLog({ actor = null, action, targetType = "", targetId = null, metadata = {}, ip = "", requestId = "", session = null }) {
  try {
    if (!session && mongoose.connection.readyState !== 1) {
      logWarn("audit.write_skipped", {
        requestId,
        action,
        targetType,
        targetId,
        reason: "database_unavailable",
      });
      return;
    }

    const actorId = objectIdOrNull(actor?._id);
    const normalizedTargetId = objectIdOrNull(targetId);
    const entry = {
      actorId,
      actorRole:  actor?.role  || "system",
      actorEmail: actor?.email || "",
      action,
      targetType,
      targetId: normalizedTargetId,
      metadata: {
        ...metadata,
        ...(!normalizedTargetId && targetId ? { targetRef: String(targetId) } : {}),
        ...(requestId && !metadata.requestId ? { requestId } : {}),
      },
      ipAddress: ip,
    };
    if (session) {
      await AuditLog.create([entry], { session });
    } else {
      await AuditLog.create(entry);
    }
  } catch (err) {
    logError("audit.write_failed", { requestId, action, targetType, targetId, error: err });
  }
}

module.exports = { writeAuditLog };
