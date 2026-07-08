const net = require("net");

function isPrivateHost(hostname = "") {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) return true;
  const ipVersion = net.isIP(host);
  if (!ipVersion) return false;
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      parts[0] === 169;
  }
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
}

function validateDestinationUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["https:", "http:"].includes(url.protocol)) return { valid: false, reason: "unsupported_protocol" };
    if (isPrivateHost(url.hostname)) return { valid: false, reason: "private_or_local_destination_blocked" };
    return { valid: true };
  } catch {
    return { valid: false, reason: "invalid_url" };
  }
}

module.exports = { isPrivateHost, validateDestinationUrl };
