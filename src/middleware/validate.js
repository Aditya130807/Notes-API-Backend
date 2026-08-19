const { ZodError } = require('zod');

/**
 * Builds an Express middleware that validates a given part of the request
 * (`body`, `params`, or `query`) against a Zod schema.
 *
 * On success, the request property is replaced with the *parsed* value
 * (so defaults/coercions from the schema, e.g. limit's default, take
 * effect downstream).
 *
 * On failure, it forwards a structured 422 error to the centralized
 * error handler rather than responding directly, so all error responses
 * share one shape.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);

      // req.query is a getter-only accessor in Express 4 (no setter), so
      // `req.query = parsed` would silently no-op. We instead attach
      // parsed/validated data to req.validated[source], which is what
      // controllers read from. req.body and req.params are plain
      // properties and would be safe to overwrite directly, but we use
      // the same convention for all three sources for consistency.
      req.validated = req.validated || {};
      req.validated[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((issue) => ({
          path: issue.path.join('.') || source,
          message: issue.message,
        }));

        return res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details,
          },
        });
      }
      next(err);
    }
  };
}

module.exports = validate;
