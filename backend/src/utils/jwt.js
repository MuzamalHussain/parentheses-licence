const jwt = require("jsonwebtoken");
const { getConfig } = require("../config/env");

const signAccessToken = (payload) =>
  jwt.sign(payload, getConfig().auth.accessSecret, {
    expiresIn: getConfig().auth.accessExpires,
    algorithm: "HS256",
    issuer: getConfig().auth.issuer,
    audience: getConfig().auth.audience,
  });

const signRefreshToken = (payload, options = {}) =>
  jwt.sign(payload, getConfig().auth.refreshSecret, {
    expiresIn: getConfig().auth.refreshExpires,
    algorithm: "HS256",
    issuer: getConfig().auth.issuer,
    audience: getConfig().auth.audience,
    ...(options.jwtid ? { jwtid: options.jwtid } : {}),
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, getConfig().auth.accessSecret, {
    algorithms: ["HS256"],
    issuer: getConfig().auth.issuer,
    audience: getConfig().auth.audience,
  });

const verifyRefreshToken = (token) =>
  jwt.verify(token, getConfig().auth.refreshSecret, {
    algorithms: ["HS256"],
    issuer: getConfig().auth.issuer,
    audience: getConfig().auth.audience,
  });

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
