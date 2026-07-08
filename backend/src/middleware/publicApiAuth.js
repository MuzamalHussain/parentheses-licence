const ApiKeyService = require("../services/publicApi/ApiKeyService");

function publicError(res, status, code, message, requestId) {
  return res.status(status).json({ success: false, error: { code, message }, requestId });
}

async function requireApiKey(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return publicError(res, 401, "API_KEY_REQUIRED", "Bearer API key is required.", req.id);
  const rawKey = header.slice("Bearer ".length).trim();
  const result = await ApiKeyService.authenticate(rawKey, { ip: req.ip });
  if (!result.ok) return publicError(res, 401, result.code, result.message, req.id);
  req.apiKey = result.apiKey;
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    const scopes = req.apiKey?.scopes || [];
    if (!scopes.includes("admin") && !scopes.includes(scope)) {
      return publicError(res, 403, "SCOPE_REQUIRED", `Missing required scope: ${scope}.`, req.id);
    }
    next();
  };
}

module.exports = { publicError, requireApiKey, requireScope };
