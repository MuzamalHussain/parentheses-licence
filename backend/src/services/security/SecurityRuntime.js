const settings = require("../settings");
const { getConfig } = require("../../config/env");
const keys = () => settings.definitions.getGroup("security").map((d) => d.key);
let snapshot = null;
async function refresh() { snapshot = await settings.getMany(keys()); return snapshot; }
function current() { return snapshot || {}; }
function value(key, fallback) { return current()[key] ?? fallback; }
async function middleware(req, res, next) { try { if (!snapshot) await refresh(); req.securityPolicy = current(); next(); } catch (error) { next(error); } }
function jwt() { const cfg = getConfig(); return { ...value("security.jwt", { accessTokenLifetime: cfg.auth.accessExpires, refreshTokenLifetime: cfg.auth.refreshExpires, signingAlgorithm: "HS256", clockSkewSeconds: 30 }), accessSecret: cfg.auth.accessSecret, refreshSecret: cfg.auth.refreshSecret, issuer: cfg.auth.issuer, audience: cfg.auth.audience }; }
function cookies() { return value("security.cookies", { httpOnly: true, secure: getConfig().app.isProduction, sameSite: "strict", lifetimeMs: 604800000, prefix: "" }); }
module.exports = { refresh, current, value, middleware, jwt, cookies };
