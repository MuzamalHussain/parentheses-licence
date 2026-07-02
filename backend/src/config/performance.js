function intEnv(name, defaultValue) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

module.exports = {
  pagination: {
    defaultLimit: intEnv("API_PAGINATION_DEFAULT_LIMIT", 20),
    maxLimit: intEnv("API_PAGINATION_MAX_LIMIT", 100),
    customerMaxLimit: intEnv("API_CUSTOMER_PAGINATION_MAX_LIMIT", 50),
  },
  cache: {
    dashboardTtlMs: intEnv("DASHBOARD_CACHE_TTL_MS", 30_000),
    statsTtlMs: intEnv("STATS_CACHE_TTL_MS", 30_000),
  },
  logging: {
    slowRequestMs: intEnv("SLOW_REQUEST_THRESHOLD_MS", 750),
    memoryLogHeapMb: intEnv("MEMORY_LOG_HEAP_MB", 256),
  },
};
