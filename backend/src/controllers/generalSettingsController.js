const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const settings = require("../services/settings");
const { assertGeneralKey } = require("../services/settings/GeneralSettingDefinitions");
const validators = require("../services/settings/SettingValidators");
const { hasValidSignature, TYPES } = require("../middleware/generalSettingsUpload");
const { AppError } = require("../utils/errorHandler");
const { getConfig } = require("../config/env");

const ASSET_ROOT = path.resolve(process.cwd(), getConfig().storage.pluginUploadDir, "general-settings");
fs.mkdirSync(ASSET_ROOT, { recursive: true });
const auditEvent = (key) => ({ "general.brandLogo": "general.logo.updated", "general.favicon": "general.favicon.updated", "general.defaultCurrency": "general.currency.updated", "general.timezone": "general.timezone.updated" }[key] || "general.updated");
const context = (req, key) => ({ actorId: req.user._id, requestId: req.id, ip: req.ip, auditEvent: auditEvent(key) });

exports.getGeneralSettings = asyncHandler(async (req, res) => {
  const definitions = settings.definitions.getGroup("general").sort((a, b) => a.ui.order - b.ui.order);
  const data = [];
  for (const definition of definitions) { const resolved = await settings.get(definition.key, { withMetadata: true }); data.push({ key: definition.key, label: definition.label, description: definition.description, type: definition.type, required: definition.required, value: resolved.value, source: resolved.source, version: resolved.version || 0, options: definition.options || [] }); }
  res.json({ success: true, data });
});

exports.updateGeneralSettings = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body.settings || {});
  if (!entries.length) throw new AppError("At least one General Setting is required.", 422);
  for (const [key, value] of entries) { assertGeneralKey(key); validators.validate(settings.definitions.get(key), value); }
  const updated = {};
  for (const [key, value] of entries) { assertGeneralKey(key); updated[key] = await settings.set(key, value, context(req, key)); }
  res.json({ success: true, message: "General settings updated.", data: updated });
});

exports.uploadGeneralAsset = (kind) => asyncHandler(async (req, res) => {
  if (!hasValidSignature(kind, req.file)) throw new AppError(`Uploaded ${kind} content is not a valid image.`, 422);
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!TYPES[kind].extensions.includes(extension)) throw new AppError(`Invalid ${kind} extension.`, 422);
  const filename = `${kind}-${crypto.randomBytes(16).toString("hex")}${extension}`;
  await fs.promises.writeFile(path.join(ASSET_ROOT, filename), req.file.buffer, { flag: "wx" });
  const key = kind === "logo" ? "general.brandLogo" : "general.favicon";
  const value = `/api/v1/admin/settings/general/assets/${filename}`;
  await settings.set(key, value, context(req, key));
  res.status(201).json({ success: true, message: `${kind === "logo" ? "Logo" : "Favicon"} updated.`, data: { key, value } });
});

exports.getGeneralAsset = asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  if (!/^(logo|favicon)-[a-f0-9]{32}\.(png|jpe?g|webp|ico)$/.test(filename)) throw new AppError("Asset not found.", 404);
  const target = path.join(ASSET_ROOT, filename);
  if (!fs.existsSync(target)) throw new AppError("Asset not found.", 404);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.sendFile(target);
});

module.exports.ASSET_ROOT = ASSET_ROOT;
