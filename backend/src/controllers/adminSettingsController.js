const asyncHandler = require("express-async-handler");
const Setting = require("../models/Setting");
const { DEFAULT_SETTINGS } = require("../config/defaultSettings");
const { getFeatureFlags } = require("../config/featureFlags");
const { getPaymentProviderStatuses } = require("../services/paymentProviderStatus");
const { AppError } = require("../utils/errorHandler");
const { writeAuditLog } = require("../utils/auditLog");

async function ensureDefaultSettings() {
  await Promise.all(
    DEFAULT_SETTINGS.map((setting) =>
      Setting.updateOne(
        { key: setting.key },
        {
          $setOnInsert: {
            ...setting,
            isSecret: Boolean(setting.isSecret),
            isPublic: Boolean(setting.isPublic),
            isEditable: setting.isEditable !== false,
            isReserved: setting.isReserved !== false,
          },
        },
        { upsert: true }
      )
    )
  );
}

function maskSetting(setting) {
  const data = setting.toObject ? setting.toObject() : setting;
  if (!data.isSecret) return data;

  const envConfigured = Boolean(data.envKey && process.env[data.envKey]);
  return {
    ...data,
    value: undefined,
    maskedValue: envConfigured ? "********" : "",
    configured: envConfigured || Boolean(data.value),
  };
}

function groupSettings(settings) {
  return settings.reduce((groups, setting) => {
    const safe = maskSetting(setting);
    groups[safe.group] = groups[safe.group] || [];
    groups[safe.group].push(safe);
    return groups;
  }, {});
}

function coerceValue(type, value) {
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new AppError("Boolean settings require a true/false value.", 422);
  }

  if (type === "number") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) throw new AppError("Number settings require a numeric value.", 422);
    return numberValue;
  }

  if (type === "json") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new AppError("JSON settings require an object value.", 422);
    }
    return value;
  }

  if (typeof value !== "string") throw new AppError("String settings require a text value.", 422);
  return value.trim();
}

exports.getSettings = asyncHandler(async (req, res) => {
  await ensureDefaultSettings();
  const settings = await Setting.find({}).sort({ group: 1, key: 1 });
  res.json({ success: true, data: groupSettings(settings) });
});

exports.updateSetting = asyncHandler(async (req, res) => {
  await ensureDefaultSettings();

  const setting = await Setting.findOne({ key: req.params.key });
  if (!setting) throw new AppError("Setting not found.", 404);
  if (!setting.isEditable) throw new AppError("This setting is read-only.", 403);
  if (setting.isSecret) throw new AppError("Use the secret settings endpoint for secret updates.", 400);

  const nextValue = coerceValue(setting.type, req.body.value);
  const previousValue = setting.value;

  setting.value = nextValue;
  setting.updatedBy = req.user._id;
  await setting.save();

  await writeAuditLog({
    actor: req.user,
    action: "setting.updated",
    targetType: "Setting",
    targetId: setting._id,
    metadata: { key: setting.key, previousValue, nextValue },
    ip: req.ip,
  });

  res.json({ success: true, message: "Setting updated.", data: maskSetting(setting) });
});

exports.updateSecretSetting = asyncHandler(async (req, res) => {
  await ensureDefaultSettings();

  const setting = await Setting.findOne({ key: req.params.key });
  if (!setting) throw new AppError("Setting not found.", 404);
  if (!setting.isSecret) throw new AppError("This setting is not secret.", 400);

  const value = req.body.value;
  if (!value || value === "********") {
    return res.json({ success: true, message: "Secret unchanged.", data: maskSetting(setting) });
  }

  throw new AppError(
    "Secret updates are reserved until encrypted settings storage is implemented. Update this value in the environment instead.",
    409
  );
});

exports.getFeatureFlags = asyncHandler(async (req, res) => {
  res.json({ success: true, data: getFeatureFlags() });
});

exports.getPaymentProviders = asyncHandler(async (req, res) => {
  res.json({ success: true, data: getPaymentProviderStatuses() });
});
