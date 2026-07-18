const { ValidationFailed } = require("./errors");
const registry = new Map();
const fail = (message) => ({ valid: false, message });
const ok = (value) => ({ valid: true, value });
const boolean = (value) => { if (typeof value === "boolean") return ok(value); const v = String(value).trim().toLowerCase(); if (["true", "1", "yes", "on"].includes(v)) return ok(true); if (["false", "0", "no", "off"].includes(v)) return ok(false); return fail("must be a boolean"); };
const number = (value) => { const parsed = typeof value === "number" ? value : Number(String(value).trim()); return Number.isFinite(parsed) ? ok(parsed) : fail("must be a finite number"); };
const duration = (value) => { if (typeof value === "number" && value >= 0) return ok(value); const match = String(value).trim().match(/^(\d+)(ms|s|m|h|d)?$/i); if (!match) return fail("must be milliseconds or a duration such as 500ms, 30s, 5m, 2h, or 1d"); const scale = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }; return ok(Number(match[1]) * (match[2] ? scale[match[2].toLowerCase()] : 1)); };
const builtins = {
  string: (v) => typeof v === "string" ? ok(v) : fail("must be a string"), number, boolean,
  enum: (v, d) => (d.options || []).includes(v) ? ok(v) : fail(`must be one of: ${(d.options || []).join(", ")}`),
  array: (v) => Array.isArray(v) ? ok(v) : fail("must be an array"), object: (v) => v && typeof v === "object" && !Array.isArray(v) ? ok(v) : fail("must be an object"),
  url: (v) => { try { return ok(new URL(String(v)).toString()); } catch { return fail("must be a valid URL"); } },
  email: (v) => { const text = String(v).trim(); const match = text.match(/^(?:[^<>]*<)?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/); return match ? ok(match[1]) : fail("must be a valid email address"); },
  host: (v) => /^(?=.{1,253}$)(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.test(String(v)) ? ok(String(v)) : fail("must be a valid host"),
  port: (v) => { const r = number(v); return r.valid && Number.isInteger(r.value) && r.value >= 1 && r.value <= 65535 ? r : fail("must be an integer port from 1 to 65535"); },
  secret: (v) => typeof v === "string" && v.length > 0 ? ok(v) : fail("must be a non-empty secret"), duration,
  currency: (v) => /^[A-Z]{3}$/.test(String(v)) ? ok(String(v)) : fail("must be an ISO 4217 currency code"),
  locale: (v) => /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(String(v)) ? ok(String(v)) : fail("must be a locale such as en or en-US"),
  timezone: (v) => { try { Intl.DateTimeFormat("en", { timeZone: String(v) }); return ok(String(v)); } catch { return fail("must be a valid IANA timezone"); } },
};
Object.entries(builtins).forEach(([name, validator]) => registry.set(name, validator));
function register(name, validator) { if (!name || typeof validator !== "function") throw new TypeError("Validator name and function are required."); registry.set(name, validator); }
function validate(definition, value) { if ((value === undefined || value === null || value === "") && definition.required) throw new ValidationFailed(definition.key, ["is required"]); if (value === undefined || value === null) return value; const validator = typeof definition.validator === "function" ? definition.validator : registry.get(definition.validator || definition.type); if (!validator) throw new ValidationFailed(definition.key, [`unknown validator '${definition.validator || definition.type}'`]); const result = validator(value, definition); if (!result?.valid) throw new ValidationFailed(definition.key, [result?.message || "is invalid"]); return result.value; }
module.exports = { register, validate, has: (name) => registry.has(name), types: () => [...registry.keys()] };
