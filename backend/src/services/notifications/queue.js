class InlineNotificationQueue {
  constructor() {
    this.name = "inline";
  }

  async enqueue(job) {
    return job();
  }
}

let queue = new InlineNotificationQueue();

function getNotificationQueue() {
  return queue;
}

function setNotificationQueueForTests(nextQueue) {
  queue = nextQueue || new InlineNotificationQueue();
}

function resetNotificationQueueForTests() {
  queue = new InlineNotificationQueue();
}

module.exports = {
  InlineNotificationQueue,
  getNotificationQueue,
  setNotificationQueueForTests,
  resetNotificationQueueForTests,
};
