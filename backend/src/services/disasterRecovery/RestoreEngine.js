const Storage = require("./BackupStorageManager");
const Verifier = require("./BackupVerifier");
const { writeAuditLog } = require("../../utils/auditLog");

const restoreScopes = ["entire_platform", "organization", "user", "license", "order", "configuration"];

function validateRestore({ backupId, scope = "entire_platform", targetId = "", organizationId = "", actor = null } = {}) {
  const backup = Storage.get(backupId);
  const verification = backup ? Verifier.verify(backup) : { valid: false, errors: ["backup_not_found"] };
  const errors = [];
  if (!restoreScopes.includes(scope)) errors.push("invalid_restore_scope");
  if (!verification.valid) errors.push("backup_not_restore_ready");
  if (["organization", "user", "license", "order"].includes(scope) && !targetId) errors.push("target_id_required");
  if (organizationId && scope !== "entire_platform" && !targetId) errors.push("organization_target_required");
  if (!["admin", "super_admin"].includes(actor?.role)) errors.push("restore_permission_required");
  return {
    valid: errors.length === 0,
    errors,
    backupId,
    scope,
    targetId,
    organizationId,
    dryRunOnly: true,
    verification,
  };
}

async function planRestore(input = {}) {
  const validation = validateRestore(input);
  await writeAuditLog({
    actor: input.actor,
    action: "restore.started",
    targetType: "Backup",
    targetId: input.backupId,
    metadata: { validation, dryRunOnly: true },
    ip: input.ip,
    requestId: input.requestId,
  });
  return {
    ...validation,
    plan: validation.valid ? [
      "Enter maintenance or read-only mode.",
      "Confirm backup checksum and target scope.",
      "Restore selected resources in dependency order.",
      "Run integrity checks and service health validation.",
      "Exit maintenance mode after operator approval.",
    ] : [],
  };
}

module.exports = { planRestore, restoreScopes, validateRestore };
