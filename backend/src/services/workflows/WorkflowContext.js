class WorkflowContext {
  constructor({ eventName, payload = {}, metadata = {}, actor = null, requestId = "", ip = "", job = null } = {}) {
    this.eventName = eventName;
    this.payload = payload || {};
    this.metadata = metadata || {};
    this.actor = actor || null;
    this.requestId = requestId || "";
    this.ip = ip || "";
    this.job = job || null;
    this.emittedAt = metadata.emittedAt ? new Date(metadata.emittedAt) : new Date();
  }

  get(path, fallback = undefined) {
    if (!path) return fallback;
    const value = String(path).split(".").reduce((current, key) => current?.[key], this.payload);
    return value === undefined ? fallback : value;
  }

  toJSON() {
    return {
      eventName: this.eventName,
      metadata: this.metadata,
      requestId: this.requestId,
      ip: this.ip,
      emittedAt: this.emittedAt,
      actorId: this.actor?._id || null,
      actorRole: this.actor?.role || "system",
    };
  }
}

module.exports = WorkflowContext;
