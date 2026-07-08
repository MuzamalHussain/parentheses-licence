const PermissionResolver = require("../services/rbac/PermissionResolver");

function requirePermission(permission) {
  return async (req, _res, next) => {
    try {
      const organizationId = req.organizationId || req.params.organizationId || req.headers["x-organization-id"] || req.user?.activeOrganizationId;
      if (!organizationId) {
        const err = new Error("Organization context is required.");
        err.statusCode = 400;
        return next(err);
      }
      const allowed = await PermissionResolver.hasPermission(req.user._id, organizationId, permission);
      if (!allowed) {
        const err = new Error("You do not have permission to perform this action.");
        err.statusCode = 403;
        err.code = "PERMISSION_DENIED";
        return next(err);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission };
