const { ValidationFailed } = require("./errors");

const SUPPORTED_LOCALES = ["en", "en-US", "en-GB", "ur", "ur-PK"];
const noHtml = (maxLength, required = true) => (value, definition) => {
  const text = String(value ?? "").trim();
  const errors = [];
  if (required && !text) errors.push("is required");
  if (text.length > maxLength) errors.push(`must not exceed ${maxLength} characters`);
  if (/<[^>]*>|[<>]/.test(text)) errors.push("must not contain HTML");
  return errors.length ? { valid: false, message: errors.join("; ") } : { valid: true, value: text };
};
const httpsUrl = (optional = false) => (value) => {
  const text = String(value ?? "").trim();
  if (!text && optional) return { valid: true, value: "" };
  try { const url = new URL(text); return url.protocol === "https:" ? { valid: true, value: url.toString() } : { valid: false, message: "must use HTTPS" }; } catch { return { valid: false, message: "must be a valid HTTPS URL" }; }
};
const phone = (value) => { const compact = String(value ?? "").trim().replace(/[\s().-]/g, ""); return /^\+?[1-9]\d{6,14}$/.test(compact) ? { valid: true, value: compact.startsWith("+") ? compact : `+${compact}` } : { valid: false, message: "must be a valid international phone number" }; };
const country = (value) => /^[A-Z]{2}$/.test(String(value).trim().toUpperCase()) ? { valid: true, value: String(value).trim().toUpperCase() } : { valid: false, message: "must be an ISO 3166-1 alpha-2 country code" };
const locale = (value) => SUPPORTED_LOCALES.includes(String(value)) ? { valid: true, value: String(value) } : { valid: false, message: `must be one of: ${SUPPORTED_LOCALES.join(", ")}` };
const imagePath = (extensions) => (value) => { const text = String(value || ""); return text === "" || (text.startsWith("/api/v1/admin/settings/general/assets/") && extensions.some((ext) => text.toLowerCase().endsWith(ext))) ? { valid: true, value: text } : { valid: false, message: "must reference an uploaded image" }; };

const DEFINITIONS = [
  ["general.portalName", "Portal Name", "Parentheses Licence", noHtml(100), "Name displayed for the administration and customer portal."],
  ["general.companyName", "Company Name", "Parentheses Solutions", noHtml(150), "Legal or trading name of the company."],
  ["general.siteName", "Site Name", "Parentheses Licensing Portal", noHtml(100), "Public-facing site name."],
  ["general.applicationName", "Application Name", "Parentheses Licence", noHtml(100), "Product application name."],
  ["general.supportEmail", "Support Email", "support@example.com", "email", "Customer support email address."],
  ["general.supportUrl", "Support URL", "https://example.com/support", httpsUrl(), "HTTPS address for customer support."],
  ["general.websiteUrl", "Website URL", "https://example.com/", httpsUrl(), "Primary company website."],
  ["general.timezone", "Timezone", "UTC", "timezone", "IANA timezone used for displayed dates and times."],
  ["general.language", "Language", "en", locale, "Default supported application locale."],
  ["general.defaultCurrency", "Default Currency", "USD", "currency", "Default ISO 4217 currency."],
  ["general.dateFormat", "Date Format", "YYYY-MM-DD", null, "Default date display format.", ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]],
  ["general.timeFormat", "Time Format", "24h", null, "Default time display format.", ["12h", "24h"]],
  ["general.brandLogo", "Brand Logo", "", imagePath([".png", ".jpg", ".jpeg", ".webp"]), "Uploaded brand logo image."],
  ["general.favicon", "Favicon", "", imagePath([".ico", ".png"]), "Uploaded PNG or ICO favicon."],
  ["general.footerCopyright", "Footer Copyright", "© Parentheses Solutions", noHtml(250), "Copyright text displayed in the footer."],
  ["general.organizationAddress", "Organization Address", "Not provided", noHtml(500), "Company mailing or registered address."],
  ["general.phoneNumber", "Phone Number", "+10000000000", phone, "International support or company phone number."],
  ["general.defaultCountry", "Default Country", "US", country, "Default ISO country code."],
  ["general.companyRegistrationNumber", "Company Registration Number", "Not provided", noHtml(100), "Official company registration number."],
  ["general.taxIdentifier", "Tax Identifier", "", noHtml(100, false), "Optional tax identifier."],
];

function registerGeneralSettings(registry) {
  for (const [key, label, defaultValue, validator, description, options] of DEFINITIONS) {
    if (registry.has(key)) continue;
    registry.register({ key, label, group: "general", type: options ? "enum" : typeof validator === "string" ? validator : "string", default: defaultValue, required: !["general.brandLogo", "general.favicon", "general.taxIdentifier"].includes(key), validator: validator || "enum", options, description, ui: { section: "general", order: DEFINITIONS.findIndex((item) => item[0] === key) } });
  }
  return registry;
}

function assertGeneralKey(key) { if (!DEFINITIONS.some((item) => item[0] === key)) throw new ValidationFailed(key, ["is not a General Settings key"]); }
module.exports = { DEFINITIONS, SUPPORTED_LOCALES, registerGeneralSettings, assertGeneralKey };
