const { mapError, RateLimitError, ServerError } = require("./errors");
const { Page } = require("./pagination");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHeaders(headers) {
  const output = {};
  if (!headers) return output;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      output[key.toLowerCase()] = value;
    });
    return output;
  }
  Object.entries(headers).forEach(([key, value]) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

class RequestEngine {
  constructor(options = {}) {
    if (!options.apiKey) throw new Error("apiKey is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://licence.example.com").replace(/\/+$/, "");
    this.apiVersion = options.apiVersion || "v1";
    this.sdkVersion = options.sdkVersion || "0.1.0";
    this.timeoutMs = options.timeoutMs || 30000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch || globalThis.fetch;
    this.sleep = options.sleep || sleep;
    if (typeof this.fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  }

  buildUrl(path, params = {}) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}/api/public/${this.apiVersion}${cleanPath}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  async request(method, path, options = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await this.tryRequest(method, path, options);
      } catch (err) {
        const retryable = err instanceof RateLimitError || err instanceof ServerError;
        if (!retryable || attempt >= this.maxRetries) throw err;
        const retryAfterMs = err.retryAfter ? err.retryAfter * 1000 : 250 * (2 ** attempt);
        attempt += 1;
        await this.sleep(retryAfterMs);
      }
    }
  }

  async tryRequest(method, path, options = {}) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs) : null;
    try {
      const response = await this.fetchImpl(this.buildUrl(path, options.query), {
        method,
        signal: options.signal || controller?.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": `parentheses-licence-sdk-js/${this.sdkVersion}`,
          "X-Parentheses-SDK-Version": this.sdkVersion,
          "X-Parentheses-API-Version": this.apiVersion,
          ...(options.headers || {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const headers = normalizeHeaders(response.headers);
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok || body.success === false) throw mapError(response.status, body, headers);
      return body;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async requestPage(path, query = {}) {
    const response = await this.request("GET", path, { query });
    return new Page(this, path, query, response);
  }
}

module.exports = { RequestEngine };
