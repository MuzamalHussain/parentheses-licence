const crypto = require("crypto");
const mongoose = require("mongoose");
const Policies = require("./BackupPolicyService");
const Storage = require("./BackupStorageManager");
const Verifier = require("./BackupVerifier");
const { writeAuditLog } = require("../../utils/auditLog");

const modelTargets = {
  organizations: "Organization",
  licenses: "License",
  orders: "Order",
  audit_logs: "AuditLog",
  ai_configuration: "AIProviderConfig",
};

async function countModel(modelName) {
  const model = mongoose.models[modelName];
  if (!model || mongoose.connection.readyState !== 1) return 0;
  return model.countDocuments({}).catch(() => 0);
}

async function targetCounts(targets = []) {
  const counts = {};
  for (const target of targets) {
    if (target === "mongodb") counts[target] = mongoose.connection.readyState === 1 ? 1 : 0;
    else if (target === "configuration") counts[target] = 1;
    else if (target === "uploaded_files" || target === "plugin_packages") counts[target] = 0;
    else counts[target] = await countModel(modelTargets[target]);
  }
  return counts;
}

async function createBackup({ type = "manual", targets, policyId = "enterprise-default", actor = null, ip = "", requestId = "" } = {}) {
  const policy = Policies.getPolicy(policyId);
  const selectedTargets = targets?.length ? targets : policy.targets;
  const startedAt = Date.now();
  const id = `bkp_${crypto.randomUUID()}`;
  await writeAuditLog({ actor, action: "backup.started", targetType: "Backup", targetId: id, metadata: { type, targets: selectedTargets }, ip, requestId });
  try {
    const counts = await targetCounts(selectedTargets);
    const manifest = {
      id,
      type,
      policyId,
      status: "completed",
      targets: selectedTargets,
      createdAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      counts,
      sizeBytes: Buffer.byteLength(JSON.stringify(counts)),
      durationMs: Date.now() - startedAt,
    };
    const stored = await Storage.store(manifest, { actorId: actor?._id || null, ip, requestId, targetCounts: counts });
    const verification = Verifier.verify(stored);
    await writeAuditLog({ actor, action: "backup.completed", targetType: "Backup", targetId: id, metadata: { verification, durationMs: stored.durationMs }, ip, requestId });
    return { ...stored, verification };
  } catch (err) {
    await writeAuditLog({ actor, action: "backup.failed", targetType: "Backup", targetId: id, metadata: { error: err.message }, ip, requestId });
    throw err;
  }
}

function listBackups() {
  return Storage.list();
}

function getBackup(id) {
  return Storage.get(id);
}

module.exports = { createBackup, getBackup, listBackups, targetCounts };
