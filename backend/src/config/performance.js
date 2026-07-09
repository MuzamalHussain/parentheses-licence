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
  budgets: {
    apiResponseMs: intEnv("PERF_BUDGET_API_RESPONSE_MS", 750),
    dashboardLoadMs: intEnv("PERF_BUDGET_DASHBOARD_LOAD_MS", 1500),
    searchMs: intEnv("PERF_BUDGET_SEARCH_MS", 500),
    downloadsMs: intEnv("PERF_BUDGET_DOWNLOAD_MS", 1000),
    queueJobMs: intEnv("PERF_BUDGET_QUEUE_JOB_MS", 5000),
    databaseQueryMs: intEnv("PERF_BUDGET_DATABASE_QUERY_MS", 250),
    aiRequestMs: intEnv("PERF_BUDGET_AI_REQUEST_MS", 10_000),
    webhookMs: intEnv("PERF_BUDGET_WEBHOOK_MS", 3000),
  },
  payloads: {
    largeRequestBytes: intEnv("LARGE_REQUEST_BYTES", 250_000),
    largeResponseBytes: intEnv("LARGE_RESPONSE_BYTES", 250_000),
  },
  logging: {
    slowRequestMs: intEnv("SLOW_REQUEST_THRESHOLD_MS", 750),
    memoryLogHeapMb: intEnv("MEMORY_LOG_HEAP_MB", 256),
  },
};
