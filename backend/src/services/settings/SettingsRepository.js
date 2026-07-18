const RuntimeSetting = require("../../models/RuntimeSetting");
const RuntimeSettingVersion = require("../../models/RuntimeSettingVersion");
const RuntimeSettingAudit = require("../../models/RuntimeSettingAudit");
const mongoose = require("mongoose");
class SettingsRepository {
  constructor({ settingModel = RuntimeSetting, versionModel = RuntimeSettingVersion, auditModel = RuntimeSettingAudit } = {}) { this.Setting = settingModel; this.Version = versionModel; this.Audit = auditModel; }
  async findByKey(key) { if (mongoose.connection.readyState !== 1) return null; return this.Setting.findOne({ key }).select("+encryptedValue").lean(); }
  async findMany(keys) { return this.Setting.find({ key: { $in: keys } }).select("+encryptedValue").lean(); }
  async findGroup(group) { return this.Setting.find({ group }).select("+encryptedValue").sort({ key: 1 }).lean(); }
  async search({ group, query, limit = 100 } = {}) { const filter = {}; if (group) filter.group = group; if (query) filter.key = { $regex: String(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }; return this.Setting.find(filter).limit(Math.min(limit, 500)).lean(); }
  async upsert(record, context = {}) { const current = await this.findByKey(record.key); const version = (current?.version || 0) + 1; const saved = await this.Setting.findOneAndUpdate({ key: record.key }, { $set: { ...record, version, updatedBy: context.actorId || null } }, { new: true, upsert: true, runValidators: true }).select("+encryptedValue").lean(); await this.Version.create({ ...record, version, operation: current ? "update" : "create", actorId: context.actorId || null, metadata: context.metadata || {} }); return { record: saved, created: !current }; }
  async remove(key, context = {}) { const current = await this.Setting.findOneAndDelete({ key }).select("+encryptedValue").lean(); if (current) await this.Version.create({ ...current, version: current.version + 1, operation: "delete", actorId: context.actorId || null, metadata: context.metadata || {} }); return current; }
  async bulkUpsert(records, context = {}) { const results = []; for (const record of records) results.push(await this.upsert(record, context)); return results; }
  async history(key, { limit = 50 } = {}) { return this.Version.find({ key }).sort({ version: -1 }).limit(Math.min(limit, 200)).lean(); }
  async audit(event, data = {}) { return this.Audit.create({ event, ...data }); }
}
module.exports = SettingsRepository;
