const asyncHandler = require("express-async-handler");
const Continuity = require("../services/disasterRecovery/BusinessContinuityService");
const BackupManager = require("../services/disasterRecovery/BackupManager");
const BackupVerifier = require("../services/disasterRecovery/BackupVerifier");
const Scheduler = require("../services/disasterRecovery/BackupScheduler");
const Policies = require("../services/disasterRecovery/BackupPolicyService");
const Restore = require("../services/disasterRecovery/RestoreEngine");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Continuity.dashboard(), requestId: req.id });
});

exports.createBackup = asyncHandler(async (req, res) => {
  const data = await BackupManager.createBackup({
    type: req.body?.type || "manual",
    targets: req.body?.targets || [],
    policyId: req.body?.policyId || "enterprise-default",
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(201).json({ success: true, data, requestId: req.id });
});

exports.listBackups = asyncHandler(async (req, res) => {
  res.json({ success: true, data: BackupManager.listBackups(), requestId: req.id });
});

exports.verifyBackup = asyncHandler(async (req, res) => {
  res.json({ success: true, data: BackupVerifier.verify(req.params.id), requestId: req.id });
});

exports.planRestore = asyncHandler(async (req, res) => {
  const data = await Restore.planRestore({
    backupId: req.body?.backupId || req.params.id,
    scope: req.body?.scope || "entire_platform",
    targetId: req.body?.targetId || "",
    organizationId: req.body?.organizationId || "",
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: data.valid, data, requestId: req.id });
});

exports.configureSchedule = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Scheduler.configure(req.body || {}), requestId: req.id });
});

exports.updatePolicy = asyncHandler(async (req, res) => {
  const data = Policies.updatePolicy(req.params.id || "enterprise-default", req.body || {});
  res.json({ success: true, data, requestId: req.id });
});
