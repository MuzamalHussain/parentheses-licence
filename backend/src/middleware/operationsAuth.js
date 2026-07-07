const { AppError } = require("../utils/errorHandler");

function isSuperAdmin(user) {
  return user?.role === "super_admin" || user?.role === "admin";
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return next(new AppError("You do not have permission to access the operations center.", 403));
  }
  next();
}

module.exports = { isSuperAdmin, requireSuperAdmin };
