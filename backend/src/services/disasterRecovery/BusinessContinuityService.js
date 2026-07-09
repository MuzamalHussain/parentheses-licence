const Operations = require("../operations/OperationsService");
const Health = require("../infrastructure/HealthRegistry");
const Policies = require("./BackupPolicyService");
const Backups = require("./BackupManager");
const Scheduler = require("./BackupScheduler");
const RecoveryPlans = require("./RecoveryPlanService");

async function dashboard() {
  const [operations, health] = await Promise.all([
    Operations.getRuntimeState(),
    Health.snapshot(),
  ]);
  const backups = Backups.listBackups();
  const policies = Policies.listPolicies();
  const recoveryPlans = RecoveryPlans.listPlans();
  return {
    generatedAt: new Date().toISOString(),
    operations,
    health,
    backups,
    policies,
    schedules: Scheduler.listSchedules(),
    recoveryPlans,
    readiness: RecoveryPlans.readiness({ backups, policies }),
    continuity: {
      maintenanceMode: operations.maintenanceMode,
      readOnlyMode: operations.readOnlyMode,
      serviceStatus: health.status,
      recoveryChecklistReady: true,
      backgroundBackups: true,
      vendorNeutralStorage: true,
    },
  };
}

module.exports = { dashboard };
