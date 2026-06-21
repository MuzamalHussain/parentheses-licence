const asyncHandler = require("express-async-handler");
const { verifyAccessToken } = require("../utils/jwt");
const { AppError } = require("../utils/errorHandler");
const User = require("../models/User");

// Verifies JWT access token and attaches user to req.user
const requireAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) throw new AppError("Not authenticated. Please log in.", 401);

  const decoded = verifyAccessToken(token);

  const user = await User.findById(decoded.id).select("-passwordHash");
  if (!user) throw new AppError("User no longer exists.", 401);
  if (!user.isActive) throw new AppError("Your account has been deactivated.", 403);

  req.user = user;
  next();
});

// Role-based access control — call AFTER requireAuth
const requireRole = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new AppError("You do not have permission to perform this action.", 403));
    }
    next();
  };

module.exports = { requireAuth, requireRole };
