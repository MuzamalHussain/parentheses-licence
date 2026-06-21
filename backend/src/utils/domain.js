/**
 * Normalizes a domain string for consistent storage and comparison.
 *
 * Rules applied:
 *  1. Lowercase
 *  2. Strip protocol (http:// https://)
 *  3. Strip trailing slash
 *  4. Strip www. prefix (optional — disabled by default; set stripWww=true to enable)
 *  5. Strip port (443 and 80 stripped; others kept so staging.site:8080 ≠ staging.site)
 *
 * Examples:
 *   "https://www.Example.com/"  → "www.example.com"
 *   "http://mysite.com:80"      → "mysite.com"
 *   "staging.site:8080"         → "staging.site:8080"
 */
function normalizeDomain(raw, { stripWww = false } = {}) {
  if (!raw || typeof raw !== "string") return "";

  let domain = raw.trim().toLowerCase();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");

  // Remove path (everything after first /)
  domain = domain.split("/")[0];

  // Remove standard ports
  domain = domain.replace(/:80$/, "").replace(/:443$/, "");

  // Optionally strip www.
  if (stripWww) domain = domain.replace(/^www\./, "");

  return domain;
}

/**
 * Validates that a domain string looks plausible.
 * Not a strict RFC validator — just sanity-checks for obvious garbage.
 */
function isValidDomain(domain) {
  if (!domain || domain.length > 253) return false;
  // Allow labels (a-z 0-9 -), dots, optional :port, optional subdomains
  return /^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?(:[0-9]{1,5})?$/.test(domain);
}

module.exports = { normalizeDomain, isValidDomain };
