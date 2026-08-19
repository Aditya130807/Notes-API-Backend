const { z } = require('zod');

// Shared field-level rules kept in one place so create/update stay in sync.
const title = z
  .string({ required_error: 'title is required' })
  .trim()
  .min(1, 'title must not be empty')
  .max(200, 'title must be 200 characters or fewer');

const content = z
  .string({ required_error: 'content is required' })
  .trim()
  .min(1, 'content must not be empty')
  .max(20000, 'content must be 20000 characters or fewer');

// POST /api/notes
const createNoteSchema = z
  .object({
    title,
    content,
  })
  .strict(); // reject unknown fields

// PATCH /api/notes/:id — partial update, but at least one field required.
const updateNoteSchema = z
  .object({
    title: title.optional(),
    content: content.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one of "title" or "content" must be provided',
  });

// UUID route param, e.g. GET /api/notes/:id
const noteIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// GET /api/notes?limit=&cursor=
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const paginationQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val === undefined ? DEFAULT_LIMIT : Number(val)))
      .pipe(
        z
          .number({ invalid_type_error: 'limit must be a number' })
          .int('limit must be an integer')
          .positive('limit must be greater than 0')
          .max(MAX_LIMIT, `limit must be ${MAX_LIMIT} or less`)
      ),
    cursor: z.string().min(1).optional(),
  })
  .strict();

module.exports = {
  createNoteSchema,
  updateNoteSchema,
  noteIdParamSchema,
  paginationQuerySchema,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
