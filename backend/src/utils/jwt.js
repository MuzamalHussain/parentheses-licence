const jwt = require("jsonwebtoken");
const runtime = require("../services/security/SecurityRuntime");

const signAccessToken = (payload) =>
  jwt.sign(payload, runtime.jwt().accessSecret, {
    expiresIn: runtime.jwt().accessTokenLifetime,
    algorithm: runtime.jwt().signingAlgorithm,
    issuer: runtime.jwt().issuer,
    audience: runtime.jwt().audience,
  });

const signRefreshToken = (payload, options = {}) =>
  jwt.sign(payload, runtime.jwt().refreshSecret, {
    expiresIn: runtime.jwt().refreshTokenLifetime,
    algorithm: runtime.jwt().signingAlgorithm,
    issuer: runtime.jwt().issuer,
    audience: runtime.jwt().audience,
    ...(options.jwtid ? { jwtid: options.jwtid } : {}),
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, runtime.jwt().accessSecret, {
    algorithms: [runtime.jwt().signingAlgorithm], clockTolerance: runtime.jwt().clockSkewSeconds,
    issuer: runtime.jwt().issuer,
    audience: runtime.jwt().audience,
  });

const verifyRefreshToken = (token) =>
  jwt.verify(token, runtime.jwt().refreshSecret, {
    algorithms: [runtime.jwt().signingAlgorithm], clockTolerance: runtime.jwt().clockSkewSeconds,
    issuer: runtime.jwt().issuer,
    audience: runtime.jwt().audience,
  });

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
