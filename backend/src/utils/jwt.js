const jwt = require("jsonwebtoken");
const { getConfig } = require("../config/env");

const signAccessToken = (payload) =>
  jwt.sign(payload, getConfig().auth.accessSecret, {
    expiresIn: getConfig().auth.accessExpires,
  });

const signRefreshToken = (payload) =>
  jwt.sign(payload, getConfig().auth.refreshSecret, {
    expiresIn: getConfig().auth.refreshExpires,
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, getConfig().auth.accessSecret);

const verifyRefreshToken = (token) =>
  jwt.verify(token, getConfig().auth.refreshSecret);

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
