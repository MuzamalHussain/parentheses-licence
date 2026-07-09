const { writeAuditLog } = require("../../utils/auditLog");

async function record(action, { actor = null, organizationId = null, targetId = null, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({
    actor,
    action,
    targetType: "AI",
    targetId: targetId || organizationId,
    metadata: { organizationId, ...metadata },
    ip,
    requestId,
  }).catch(() => null);
}

module.exports = { record };
