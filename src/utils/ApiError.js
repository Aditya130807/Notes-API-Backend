/**
 * ApiError is thrown anywhere in the app when we want the centralized
 * error handler to produce a specific, predictable HTTP response.
 *
 * Example: throw new ApiError(404, 'NOTE_NOT_FOUND', 'Note not found');
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Marks this as an error we intentionally created (vs. an unexpected
    // bug), which the error handler uses to decide how much detail to
    // reveal to the client.
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }
}

module.exports = ApiError;
