class ExtensionBus {
  constructor() {
    this.hooks = new Map();
    this.filters = new Map();
    this.extensions = new Map();
  }

  registerExtension(extension) {
    if (!extension?.id) throw new Error("Extension id is required.");
    const dependencies = extension.dependencies || [];
    for (const dependency of dependencies) {
      if (!this.extensions.has(dependency)) throw new Error(`Missing extension dependency: ${dependency}`);
    }
    this.extensions.set(extension.id, { enabled: true, version: "0.1.0", ...extension });
    return extension;
  }

  on(eventName, handler) {
    if (!this.hooks.has(eventName)) this.hooks.set(eventName, []);
    this.hooks.get(eventName).push(handler);
  }

  async emit(eventName, payload, context = {}) {
    const handlers = this.hooks.get(eventName) || [];
    const results = [];
    for (const handler of handlers) results.push(await handler(payload, context));
    return results;
  }

  addFilter(name, handler) {
    if (!this.filters.has(name)) this.filters.set(name, []);
    this.filters.get(name).push(handler);
  }

  async applyFilters(name, value, context = {}) {
    let next = value;
    for (const handler of this.filters.get(name) || []) next = await handler(next, context);
    return next;
  }

  listExtensions() {
    return Array.from(this.extensions.values()).map(({ hooks, filters, ...extension }) => ({
      ...extension,
      hookCount: hooks?.length || 0,
      filterCount: filters?.length || 0,
    }));
  }
}

module.exports = new ExtensionBus();
module.exports.ExtensionBus = ExtensionBus;
