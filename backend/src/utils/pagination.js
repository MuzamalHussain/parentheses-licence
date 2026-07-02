const performanceConfig = require("../config/performance");

function getPagination(query = {}, options = {}) {
  const maxLimit = options.maxLimit || performanceConfig.pagination.maxLimit;
  const defaultLimit = options.defaultLimit || performanceConfig.pagination.defaultLimit;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

module.exports = { getPagination, paginationMeta };
