class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const { getConfig } = require("../config/env");
const { reportError } = require("../services/errorReportingService");

function sanitizeMessage(message = "") {
  return String(message)
    .replace(/[A-Za-z]:\\[^"'\s]+/g, "[path]")
    .replace(/\/[^"'\s]+/g, "[path]");
}

// Express global error handler middleware
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    message = "Invalid JSON payload.";
    statusCode = 400;
  }

  if (err.type === "entity.too.large") {
    message = "Request payload is too large.";
    statusCode = 413;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    message = "Resource already exists.";
    statusCode = 409;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
    statusCode = 422;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    message = "Invalid token.";
    statusCode = 401;
  }
  if (err.name === "TokenExpiredError") {
    message = "Token has expired.";
    statusCode = 401;
  }

  if (statusCode >= 500 || getConfig().app.isDevelopment) {
    reportError(err, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl?.split("?")[0],
      statusCode,
      source: "express",
    }).catch(() => {});
  }

  res.status(statusCode).json({
    success: false,
    message: sanitizeMessage(message),
    requestId: req.id,
  });
};

module.exports = { AppError, errorHandler };
