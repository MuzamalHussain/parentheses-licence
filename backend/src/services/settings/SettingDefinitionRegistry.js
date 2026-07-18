const { InvalidSetting, GroupNotFound } = require("./errors");
const GROUPS = ["general", "email", "payments", "security", "ai", "storage", "wordpress", "licensing", "featureFlags", "downloads", "webhooks", "cron", "queue"];
class SettingDefinitionRegistry {
  constructor(groups = GROUPS) { this.groups = new Set(groups); this.definitions = new Map(); }
  register(definition) { if (!definition?.key || !/^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(definition.key)) throw new InvalidSetting(definition?.key || "", "Setting keys must be namespaced dot paths."); if (!this.groups.has(definition.group)) throw new GroupNotFound(definition.group); if (this.definitions.has(definition.key)) throw new InvalidSetting(definition.key, "Setting definition already exists."); const normalized = Object.freeze({ required: false, encrypted: false, visible: true, editable: true, default: undefined, validator: definition.type, description: "", ui: {}, envKey: "", ...definition }); this.definitions.set(normalized.key, normalized); return normalized; }
  get(key) { return this.definitions.get(key); }
  has(key) { return this.definitions.has(key); }
  getGroup(group) { if (!this.groups.has(group)) throw new GroupNotFound(group); return [...this.definitions.values()].filter((item) => item.group === group); }
  list() { return [...this.definitions.values()]; }
  registerGroup(group) { if (!/^[a-z][a-zA-Z0-9]*$/.test(group)) throw new GroupNotFound(group); this.groups.add(group); }
}
module.exports = { SettingDefinitionRegistry, GROUPS };
