const asyncHandler = require('../utils/asyncHandler');
const notesService = require('../services/notes.service');

// POST /api/notes
const createNote = asyncHandler(async (req, res) => {
  const note = await notesService.createNote(req.validated.body);
  res.status(201).json({ data: note });
});

// GET /api/notes?limit=&cursor=
const listNotes = asyncHandler(async (req, res) => {
  const { limit, cursor } = req.validated.query;
  const { notes, nextCursor, hasNextPage } = await notesService.listNotes({ limit, cursor });

  res.status(200).json({
    data: notes,
    pagination: {
      nextCursor,
      hasNextPage,
    },
  });
});

// GET /api/notes/:id
const getNote = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const note = await notesService.getNoteById(id);
  res.status(200).json({ data: note });
});

// PATCH /api/notes/:id
const updateNote = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const note = await notesService.updateNote(id, req.validated.body);
  res.status(200).json({ data: note });
});

// DELETE /api/notes/:id
const deleteNote = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  await notesService.deleteNote(id);
  res.status(204).send();
});

module.exports = {
  createNote,
  listNotes,
  getNote,
  updateNote,
  deleteNote,
};
