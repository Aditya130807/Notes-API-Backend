const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { encodeCursor, decodeCursor } = require('../utils/cursor');

// Deterministic ordering used by both the pagination query and the
// cursor anchor lookup. createdAt alone is not unique (two notes can be
// created in the same millisecond), so id is added as a tie-breaker to
// guarantee a stable, gap-free, duplicate-free order.
const ORDER_BY = [{ createdAt: 'desc' }, { id: 'desc' }];

async function createNote({ title, content }) {
  return prisma.note.create({ data: { title, content } });
}

/**
 * Cursor-based pagination.
 *
 * We fetch `limit + 1` rows so we can tell whether another page exists
 * without a separate COUNT query. If the extra row came back, we drop it
 * and report hasNextPage: true.
 *
 * When a cursor is supplied, Prisma's `cursor` option locates the exact
 * row identified by `id` (id is unique in the schema) and `skip: 1` steps
 * past it, then continues in ORDER_BY order. Because the anchor row is
 * found by its unique id rather than by re-comparing createdAt values,
 * this remains correct and stable even when multiple notes share the
 * same createdAt timestamp — nothing is skipped or duplicated.
 */
async function listNotes({ limit, cursor }) {
  let cursorClause = {};

  if (cursor) {
    const { id } = decodeCursor(cursor);

    // Confirm the cursor still points at a real row. If the note was
    // deleted since the client got this cursor, treat it as invalid
    // rather than silently returning an unrelated page of results.
    const anchor = await prisma.note.findUnique({ where: { id } });
    if (!anchor) {
      throw ApiError.badRequest(
        'The provided cursor no longer points to an existing note',
        'INVALID_CURSOR'
      );
    }

    cursorClause = { cursor: { id }, skip: 1 };
  }

  const rows = await prisma.note.findMany({
    orderBy: ORDER_BY,
    take: limit + 1,
    ...cursorClause,
  });

  const hasNextPage = rows.length > limit;
  const notes = hasNextPage ? rows.slice(0, limit) : rows;
  const nextCursor = hasNextPage ? encodeCursor(notes[notes.length - 1]) : null;

  return { notes, nextCursor, hasNextPage };
}

async function getNoteById(id) {
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    throw ApiError.notFound('Note not found', 'NOTE_NOT_FOUND');
  }
  return note;
}

async function updateNote(id, data) {
  // Ensure a clean 404 (rather than a Prisma P2025 surfaced from the
  // update itself) so the not-found path is explicit and easy to test.
  await getNoteById(id);
  return prisma.note.update({ where: { id }, data });
}

async function deleteNote(id) {
  await getNoteById(id);
  await prisma.note.delete({ where: { id } });
}

module.exports = {
  createNote,
  listNotes,
  getNoteById,
  updateNote,
  deleteNote,
};
