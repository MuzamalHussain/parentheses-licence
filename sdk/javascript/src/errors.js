class ParenthesesApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || "SDK_ERROR";
    this.status = options.status || 0;
    this.requestId = options.requestId || "";
    this.response = options.response || null;
  }
}

class AuthenticationError extends ParenthesesApiError {}
class PermissionDeniedError extends ParenthesesApiError {}
class ValidationError extends ParenthesesApiError {}
class RateLimitError extends ParenthesesApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter || 0;
  }
}
class LicenseNotFoundError extends ParenthesesApiError {}
class ProductNotFoundError extends ParenthesesApiError {}
class ServerError extends ParenthesesApiError {}

function mapError(status, body = {}, headers = {}) {
  const error = body.error || {};
  const options = {
    code: error.code || "API_ERROR",
    status,
    requestId: body.requestId || "",
    response: body,
  };
  const message = error.message || "Parentheses Licence API request failed.";
  if (status === 401) return new AuthenticationError(message, options);
  if (status === 403) return new PermissionDeniedError(message, options);
  if (status === 404 && options.code === "LICENSE_NOT_FOUND") return new LicenseNotFoundError(message, options);
  if (status === 404 && options.code === "PRODUCT_NOT_FOUND") return new ProductNotFoundError(message, options);
  if (status === 404) return new ValidationError(message, options);
  if (status === 422 || status === 400 || status === 409) return new ValidationError(message, options);
  if (status === 429) {
    return new RateLimitError(message, {
      ...options,
      retryAfter: Number(headers["retry-after"] || headers["Retry-After"] || 0),
    });
  }
  if (status >= 500) return new ServerError(message, options);
  return new ParenthesesApiError(message, options);
}

module.exports = {
  ParenthesesApiError,
  AuthenticationError,
  PermissionDeniedError,
  ValidationError,
  RateLimitError,
  LicenseNotFoundError,
  ProductNotFoundError,
  ServerError,
  mapError,
};
