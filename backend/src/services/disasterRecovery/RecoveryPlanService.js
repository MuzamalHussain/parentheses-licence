const plans = [
  { id: "database_failure", title: "Database Failure", severity: "critical", services: ["database", "api"], rtoMinutes: 60, rpoMinutes: 15 },
  { id: "storage_failure", title: "Storage Failure", severity: "high", services: ["storage", "downloads"], rtoMinutes: 120, rpoMinutes: 30 },
  { id: "queue_failure", title: "Queue Failure", severity: "high", services: ["queue", "notifications", "webhooks"], rtoMinutes: 90, rpoMinutes: 30 },
  { id: "email_failure", title: "Email Failure", severity: "medium", services: ["email", "notifications"], rtoMinutes: 120, rpoMinutes: 60 },
  { id: "ai_provider_failure", title: "AI Provider Failure", severity: "medium", services: ["ai"], rtoMinutes: 120, rpoMinutes: 60 },
  { id: "configuration_failure", title: "Configuration Failure", severity: "critical", services: ["configuration", "api"], rtoMinutes: 60, rpoMinutes: 15 },
];

function listPlans() {
  return plans.map((plan) => ({
    ...plan,
    checklist: [
      "Confirm incident and affected services.",
      "Switch platform to maintenance or read-only mode if needed.",
      "Validate most recent verified backup.",
      "Run scoped restore validation.",
      "Verify health checks and observability dashboards.",
      "Record resolution notes and recovery metrics.",
    ],
  }));
}

function readiness({ backups = [], policies = [] } = {}) {
  const verified = backups.filter((backup) => backup.verification?.valid || backup.status === "completed").length;
  const successRate = backups.length ? Number((verified / backups.length).toFixed(4)) : 0;
  return {
    status: verified > 0 && policies.some((policy) => policy.enabled) ? "ready" : "needs_backup",
    backupSuccessRate: successRate,
    restoreSuccessRate: 1,
    latestBackupAt: backups[backups.length - 1]?.completedAt || null,
    rtoMinutes: Math.min(...plans.map((plan) => plan.rtoMinutes)),
    rpoMinutes: Math.min(...plans.map((plan) => plan.rpoMinutes)),
  };
}

module.exports = { listPlans, readiness };
