const ApiError = require('./ApiError');

/**
 * The cursor is an opaque, base64-encoded JSON string that captures the
 * position of the last record a client has seen:
 *   { id: "<uuid>", createdAt: "<ISO timestamp>" }
 *
 * We only strictly need `id` to drive Prisma's cursor query (see
 * notes.service.js), but encoding `createdAt` too makes the cursor
 * self-describing and easier to debug, without letting clients construct
 * or guess a valid cursor themselves.
 */
function encodeCursor(note) {
  const payload = JSON.stringify({ id: note.id, createdAt: note.createdAt });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      throw new Error('Malformed cursor payload');
    }

    return parsed;
  } catch {
    throw ApiError.badRequest('The provided cursor is invalid or malformed', 'INVALID_CURSOR');
  }
}

module.exports = { encodeCursor, decodeCursor };
