const Storage = require("./BackupStorageManager");

function expectedTargets() {
  return ["mongodb", "configuration", "organizations", "licenses", "orders", "audit_logs", "ai_configuration"];
}

function verify(backup) {
  const record = typeof backup === "string" ? Storage.get(backup) : backup;
  if (!record) return { status: "failed", valid: false, errors: ["backup_not_found"], checks: [] };
  const checks = [];
  const checksum = Storage.checksumFor({
    id: record.id,
    type: record.type,
    status: record.status,
    targets: record.targets,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    counts: record.counts,
    sizeBytes: record.sizeBytes,
    durationMs: record.durationMs,
    policyId: record.policyId,
  });
  checks.push({ name: "checksum", status: checksum === record.checksum ? "passed" : "failed" });
  const missingTargets = expectedTargets().filter((target) => !record.targets?.includes(target));
  checks.push({ name: "completeness", status: missingTargets.length ? "warning" : "passed", missingTargets });
  checks.push({ name: "integrity", status: record.status === "completed" ? "passed" : "failed" });
  checks.push({ name: "restore_readiness", status: record.status === "completed" && Boolean(record.checksum) ? "passed" : "failed" });
  const failed = checks.filter((check) => check.status === "failed");
  return {
    status: failed.length ? "failed" : "verified",
    valid: failed.length === 0,
    checks,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = { expectedTargets, verify };
