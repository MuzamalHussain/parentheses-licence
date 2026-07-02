module.exports = {
  logging: {
    slowRequestMs: 750,
    slowDatabaseMs: 250,
    memoryWarningHeapMb: 512,
  },
  metrics: {
    maxRouteBuckets: 100,
    maxSlowRequests: 50,
    maxRecentErrors: 50,
  },
  health: {
    databaseReadyStates: [1],
  },
  alerts: {
    enabled: false,
    channels: [],
  },
};
