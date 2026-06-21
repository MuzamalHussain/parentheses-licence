/**
 * Compares two semver-like version strings (e.g. "1.4.2", "1.4.2-beta.1").
 * Returns: -1 if a < b, 0 if equal, 1 if a > b.
 * Pre-release versions are considered lower than their release counterpart.
 */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = v.split("-");
    const parts = core.split(".").map(Number);
    return { parts, pre };
  };

  const va = parse(a);
  const vb = parse(b);

  for (let i = 0; i < 3; i++) {
    const diff = (va.parts[i] || 0) - (vb.parts[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  // Same core version — pre-release is "lower" than full release
  if (va.pre && !vb.pre) return -1;
  if (!va.pre && vb.pre) return 1;
  if (va.pre && vb.pre) return va.pre.localeCompare(vb.pre);

  return 0;
}

const isNewerVersion = (latest, current) => compareVersions(latest, current) > 0;

module.exports = { compareVersions, isNewerVersion };
