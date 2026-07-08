const { WEBHOOK_EVENTS } = require("../../models/WebhookEndpoint");

class WebhookRegistry {
  constructor() {
    this.events = new Map();
    WEBHOOK_EVENTS.forEach((eventName) => this.register(eventName));
  }

  register(eventName, metadata = {}) {
    this.events.set(eventName, {
      name: eventName,
      version: metadata.version || "v1",
      description: metadata.description || `${eventName} event`,
      ...metadata,
    });
    return this;
  }

  supports(eventName) {
    return this.events.has(eventName);
  }

  list() {
    return Array.from(this.events.values());
  }
}

module.exports = new WebhookRegistry();
module.exports.WebhookRegistry = WebhookRegistry;
