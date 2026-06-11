const config = require('../config/appConfig');
const { AppError } = require('../errors/appErrors');

const normalizeError = (err) => {
  if (!err) {
    return { status: 500, message: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR' };
  }

  if (err instanceof AppError) {
    return {
      status: err.status,
      message: err.message,
      code: err.code,
      details: err.details || null,
    };
  }

  if (err.name === 'ValidationError') {
    return {
      status: 400,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.values(err.errors || {}).map((entry) => ({
        field: entry.path,
        message: entry.message,
      })),
    };
  }

  if (err.name === 'CastError') {
    return {
      status: 400,
      message: `Invalid ${err.path || 'identifier'} format`,
      code: 'INVALID_IDENTIFIER',
      details: { path: err.path, value: err.value },
    };
  }

  if (err.code === 11000) {
    const duplicatedField = Object.keys(err.keyValue || {})[0] || 'field';
    return {
      status: 409,
      message: `${duplicatedField} already exists`,
      code: 'DUPLICATE_KEY',
      details: { field: duplicatedField, value: err.keyValue?.[duplicatedField] },
    };
  }

  if (err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError') {
    return {
      status: 503,
      message: 'Database connection error',
      code: 'DATABASE_CONNECTION_ERROR',
    };
  }

  if (err.status && Number.isInteger(Number(err.status))) {
    return {
      status: Number(err.status),
      message: err.message || 'Request failed',
      code: err.code || 'REQUEST_ERROR',
      details: err.details || null,
    };
  }

  return {
    status: 500,
    message: 'Internal Server Error',
    code: 'INTERNAL_SERVER_ERROR',
  };
};

// Centralized error handler middleware
module.exports = (err, req, res, next) => {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) return next(err);

  const normalized = normalizeError(err);

  // Log error server-side (could be expanded to use logging services)
  console.error('[ErrorHandler]', {
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  });

  const response = {
    success: false,
    message: normalized.message,
    code: normalized.code,
    ...(!config.isProduction && normalized.details ? { details: normalized.details } : {}),
    ...(!config.isProduction && err?.stack ? { stack: err.stack } : {}),
  };

  return res.status(normalized.status).json(response);
};
