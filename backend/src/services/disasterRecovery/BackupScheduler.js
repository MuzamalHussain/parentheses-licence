const schedules = new Map();

const intervals = {
  hourly: "0 * * * *",
  daily: "0 2 * * *",
  weekly: "0 3 * * 0",
  monthly: "0 4 1 * *",
};

function configure({ id = "default", frequency = "daily", customSchedule = "", backupType = "incremental", enabled = true } = {}) {
  const schedule = {
    id,
    frequency,
    cron: customSchedule || intervals[frequency] || frequency,
    backupType,
    enabled,
    backgroundExecution: true,
    nextRunHint: frequency,
    updatedAt: new Date().toISOString(),
  };
  schedules.set(id, schedule);
  return schedule;
}

function listSchedules() {
  if (!schedules.size) configure();
  return Array.from(schedules.values());
}

function resetForTests() {
  schedules.clear();
}

module.exports = { configure, listSchedules, resetForTests };
