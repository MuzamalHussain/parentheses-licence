const asyncHandler = require("express-async-handler");
const NotificationTemplate = require("../models/NotificationTemplate");
const NotificationManager = require("../services/NotificationManager");
const TemplateService = require("../services/notifications/NotificationTemplateService");
const { writeAuditLog } = require("../utils/auditLog");

exports.getProviders = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: NotificationManager.listProviders() });
});

exports.getTemplates = asyncHandler(async (_req, res) => {
  const stored = await NotificationTemplate.find({}).sort({ key: 1, channel: 1 }).lean();
  res.json({
    success: true,
    data: {
      defaults: TemplateService.DEFAULT_TEMPLATE_DEFINITIONS,
      stored,
    },
  });
});

exports.previewTemplate = asyncHandler(async (req, res) => {
  const preview = await TemplateService.previewTemplate(req.body);
  res.json({ success: true, data: preview });
});

exports.updateTemplate = asyncHandler(async (req, res) => {
  const template = await TemplateService.upsertTemplate({
    key: req.params.key,
    channel: req.body.channel || "email",
    subject: req.body.subject,
    htmlBody: req.body.htmlBody,
    textBody: req.body.textBody,
    variables: req.body.variables || [],
    enabled: req.body.enabled !== false,
    actor: req.user,
  });

  await writeAuditLog({
    actor: req.user,
    action: "notification.template_updated",
    targetType: "NotificationTemplate",
    targetId: template._id,
    metadata: { key: template.key, channel: template.channel },
    ip: req.ip,
  });

  res.json({ success: true, message: "Notification template updated.", data: template });
});
