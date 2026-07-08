const OrganizationService = require("../services/organizationService");

async function attachOrganizationContext(req, _res, next) {
  try {
    const requested = req.headers["x-organization-id"] || req.query.organizationId || req.user?.activeOrganizationId;
    if (!requested) return next();
    const { organization, membership } = await OrganizationService.assertMembership(req.user._id, requested);
    req.organization = organization;
    req.organizationMembership = membership;
    req.organizationId = organization._id;
    next();
  } catch (err) {
    next(err);
  }
}

function requireOrganizationRole(...roles) {
  return (req, _res, next) => {
    if (!req.organizationMembership) {
      const err = new Error("Organization context is required.");
      err.statusCode = 400;
      return next(err);
    }
    if (!roles.includes(req.organizationMembership.role)) {
      const err = new Error("You do not have permission for this organization.");
      err.statusCode = 403;
      return next(err);
    }
    next();
  };
}

function tenantFilter(req, extra = {}) {
  if (req.organizationId) return { ...extra, organizationId: req.organizationId };
  return { ...extra };
}

module.exports = { attachOrganizationContext, requireOrganizationRole, tenantFilter };
