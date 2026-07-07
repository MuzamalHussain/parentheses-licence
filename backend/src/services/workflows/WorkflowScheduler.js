const FREQUENCY_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function nextRunFor(frequency, from = new Date()) {
  return new Date(from.getTime() + (FREQUENCY_MS[frequency] || FREQUENCY_MS.daily));
}

class WorkflowScheduler {
  constructor(registry) {
    this.registry = registry;
  }

  listRecurring() {
    return this.registry.listRecurring().map((job) => ({
      ...job,
      nextRunAt: nextRunFor(job.frequency),
    }));
  }

  nextRunFor(frequency, from) {
    return nextRunFor(frequency, from);
  }
}

module.exports = WorkflowScheduler;
module.exports.nextRunFor = nextRunFor;
