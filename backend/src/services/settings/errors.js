class SettingsError extends Error { constructor(message, code, statusCode = 400, details = {}) { super(message); this.name = this.constructor.name; this.code = code; this.statusCode = statusCode; this.details = details; } }
class SettingNotFound extends SettingsError { constructor(key) { super(`Setting '${key}' is not defined.`, "SETTING_NOT_FOUND", 404, { key }); } }
class InvalidSetting extends SettingsError { constructor(key, message) { super(message || `Setting '${key}' is invalid.`, "INVALID_SETTING", 400, { key }); } }
class ValidationFailed extends SettingsError { constructor(key, errors) { super(`Validation failed for setting '${key}'.`, "SETTING_VALIDATION_FAILED", 422, { key, errors }); } }
class EncryptionFailed extends SettingsError { constructor(message, cause) { super(message, "SETTING_ENCRYPTION_FAILED", 503); this.cause = cause; } }
class GroupNotFound extends SettingsError { constructor(group) { super(`Setting group '${group}' is not registered.`, "SETTING_GROUP_NOT_FOUND", 404, { group }); } }
class ImportFailed extends SettingsError { constructor(message, details) { super(message, "SETTING_IMPORT_FAILED", 422, details); } }
class ExportFailed extends SettingsError { constructor(message, details) { super(message, "SETTING_EXPORT_FAILED", 500, details); } }
module.exports = { SettingsError, SettingNotFound, InvalidSetting, ValidationFailed, EncryptionFailed, GroupNotFound, ImportFailed, ExportFailed };
