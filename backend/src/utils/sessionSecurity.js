const { verifyRefreshToken } = require("./jwt");

function parseUserAgent(userAgent = "") {
  const value = String(userAgent || "");
  const lower = value.toLowerCase();

  let browser = "Unknown browser";
  if (lower.includes("edg/")) browser = "Microsoft Edge";
  else if (lower.includes("chrome/") || lower.includes("crios/")) browser = "Chrome";
  else if (lower.includes("firefox/") || lower.includes("fxios/")) browser = "Firefox";
  else if (lower.includes("safari/")) browser = "Safari";

  let operatingSystem = "Unknown OS";
  if (lower.includes("windows")) operatingSystem = "Windows";
  else if (lower.includes("mac os") || lower.includes("macintosh")) operatingSystem = "macOS";
  else if (lower.includes("iphone") || lower.includes("ipad")) operatingSystem = "iOS";
  else if (lower.includes("android")) operatingSystem = "Android";
  else if (lower.includes("linux")) operatingSystem = "Linux";

  const device = lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")
    ? "Mobile"
    : lower.includes("ipad") || lower.includes("tablet")
      ? "Tablet"
      : "Desktop";

  return { browser, operatingSystem, device };
}

function getClientIp(req) {
  return req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
}

function getSessionClient(req) {
  const userAgent = req.headers?.["user-agent"] || "";
  return {
    userAgent,
    ipAddress: getClientIp(req),
    ...parseUserAgent(userAgent),
  };
}

function getCurrentRefreshSessionId(req, userId) {
  const token = req.cookies?.refreshToken;
  if (!token) return null;

  try {
    const decoded = verifyRefreshToken(token);
    if (decoded?.id?.toString() !== userId.toString()) return null;
    return decoded.jti || null;
  } catch {
    return null;
  }
}

function serializeSession(session, currentSessionId = null) {
  return {
    sessionId: session.sessionId,
    browser: session.browser || parseUserAgent(session.userAgent).browser,
    operatingSystem: session.operatingSystem || parseUserAgent(session.userAgent).operatingSystem,
    device: session.device || parseUserAgent(session.userAgent).device,
    ipAddress: session.ipAddress || "",
    loginAt: session.loginAt || session.createdAt,
    lastActivity: session.lastUsedAt || session.createdAt,
    expiresAt: session.expiresAt,
    currentSession: Boolean(currentSessionId && session.sessionId === currentSessionId),
  };
}

function activeSerializedSessions(user, currentSessionId = null) {
  const now = Date.now();
  return (user.refreshSessions || [])
    .filter((session) => session.expiresAt && new Date(session.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.lastUsedAt || b.createdAt) - new Date(a.lastUsedAt || a.createdAt))
    .map((session) => serializeSession(session, currentSessionId));
}

module.exports = {
  activeSerializedSessions,
  getCurrentRefreshSessionId,
  getSessionClient,
  parseUserAgent,
  serializeSession,
};
