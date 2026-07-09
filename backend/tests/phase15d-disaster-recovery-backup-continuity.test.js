process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15d_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15d_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15d_refresh_secret";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

require("../src/models/Organization");
require("../src/models/License");
require("../src/models/Order");
require("../src/models/AuditLog");

const Policies = require("../src/services/disasterRecovery/BackupPolicyService");
const Storage = require("../src/services/disasterRecovery/BackupStorageManager");
const Backups = require("../src/services/disasterRecovery/BackupManager");
const Verifier = require("../src/services/disasterRecovery/BackupVerifier");
const Scheduler = require("../src/services/disasterRecovery/BackupScheduler");
const Restore = require("../src/services/disasterRecovery/RestoreEngine");
const RecoveryPlans = require("../src/services/disasterRecovery/RecoveryPlanService");
const Continuity = require("../src/services/disasterRecovery/BusinessContinuityService");

function reset() {
  Policies.resetForTests();
  Storage.resetForTests();
  Scheduler.resetForTests();
}

async function testBackupCreationAndVerification() {
  const backup = await Backups.createBackup({
    type: "manual",
    targets: ["mongodb", "configuration", "organizations", "licenses", "orders", "audit_logs", "ai_configuration"],
    actor: { role: "admin", _id: null },
  });
  assert.strictEqual(backup.status, "completed");
  assert.ok(backup.checksum);
  assert.strictEqual(backup.metadataPreview.encrypted, true);
  assert.strictEqual(backup.verification.valid, true);
  assert.strictEqual(Verifier.verify(backup.id).valid, true);
  assert.strictEqual(Backups.listBackups().length, 1);
}

function testEncryptedBackupMetadata() {
  const encrypted = Storage.encryptMetadata({ requestId: "req_15d", secret: "hidden" });
  assert.notStrictEqual(encrypted.value, "hidden");
  const decrypted = Storage.decryptMetadata(encrypted);
  assert.strictEqual(decrypted.requestId, "req_15d");
  assert.strictEqual(decrypted.secret, "hidden");
}

async function testRestoreValidation() {
  const backup = Backups.listBackups()[0];
  const allowed = Restore.validateRestore({
    backupId: backup.id,
    scope: "entire_platform",
    actor: { role: "admin" },
  });
  assert.strictEqual(allowed.valid, true);

  const denied = Restore.validateRestore({
    backupId: backup.id,
    scope: "license",
    targetId: "lic_1",
    actor: { role: "customer" },
  });
  assert.strictEqual(denied.valid, false);
  assert.ok(denied.errors.includes("restore_permission_required"));

  const plan = await Restore.planRestore({ backupId: backup.id, scope: "entire_platform", actor: { role: "admin" } });
  assert.ok(plan.plan.length > 0);
}

function testPoliciesSchedulesAndRecoveryPlans() {
  const policy = Policies.updatePolicy("enterprise-default", { retentionDays: 90, rtoMinutes: 30 });
  assert.strictEqual(policy.retentionDays, 90);
  const schedule = Scheduler.configure({ frequency: "hourly", backupType: "incremental" });
  assert.strictEqual(schedule.frequency, "hourly");
  assert.ok(Scheduler.listSchedules().length > 0);
  const plans = RecoveryPlans.listPlans();
  assert.ok(plans.some((plan) => plan.id === "database_failure"));
}

async function testContinuityDashboard() {
  const dashboard = await Continuity.dashboard();
  assert.ok(dashboard.backups.length >= 1);
  assert.ok(dashboard.policies.length >= 1);
  assert.ok(dashboard.recoveryPlans.length >= 1);
  assert.ok(dashboard.readiness);
  assert.strictEqual(dashboard.continuity.vendorNeutralStorage, true);
}

async function run() {
  reset();
  await testBackupCreationAndVerification();
  testEncryptedBackupMetadata();
  await testRestoreValidation();
  testPoliciesSchedulesAndRecoveryPlans();
  await testContinuityDashboard();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15D disaster recovery backup continuity tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
