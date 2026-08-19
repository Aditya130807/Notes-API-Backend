const { Prisma } = require('@prisma/client');
const ApiError = require('../utils/ApiError');

/**
 * Maps known Prisma error codes to an ApiError. Full reference:
 * https://www.prisma.io/docs/orm/reference/error-reference
 */
function fromPrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025': // record to update/delete was not found
        return ApiError.notFound('Note not found', 'NOTE_NOT_FOUND');
      case 'P2002': // unique constraint violation
        return new ApiError(409, 'CONFLICT', 'A record with this value already exists');
      default:
        return new ApiError(500, 'DATABASE_ERROR', 'A database error occurred');
    }
  }

  if (
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientInitializationError
  ) {
    return new ApiError(500, 'DATABASE_ERROR', 'A database error occurred');
  }

  return null;
}

/**
 * 404 handler for routes that don't match any registered endpoint.
 * Must be registered after all routes, before the error handler.
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

/**
 * Centralized error handler. Every error in the app — validation
 * failures that reach here, ApiErrors thrown intentionally, Prisma
 * errors, or truly unexpected bugs — is normalized into the same
 * { error: { code, message, details? } } response shape.
 *
 * Express identifies this as error-handling middleware purely because
 * it declares 4 parameters (err, req, res, next); that signature must
 * be kept intact even though `next` is unused.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiError = err instanceof ApiError ? err : fromPrismaError(err);

  if (!apiError) {
    // Unexpected/unknown error: log full detail server-side, but never
    // leak stack traces or internals to the client.
    console.error('Unexpected error:', err);
    apiError = new ApiError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
  } else if (!apiError.isOperational) {
    console.error('Operational-but-unclassified error:', err);
  }

  const body = {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  };

  if (apiError.details) {
    body.error.details = apiError.details;
  }

  // Extra safety net: never let a stack trace leak in production, even
  // if something upstream attached one to the response body.
  if (process.env.NODE_ENV === 'production') {
    delete body.stack;
  }

  res.status(apiError.statusCode).json(body);
}

module.exports = { errorHandler, notFoundHandler };
