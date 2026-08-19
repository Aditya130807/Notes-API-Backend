const { Router } = require('express');
const validate = require('../middleware/validate');
const {
  createNoteSchema,
  updateNoteSchema,
  noteIdParamSchema,
  paginationQuerySchema,
} = require('../schemas/notes.schema');
const controller = require('../controllers/notes.controller');

const router = Router();

router.post('/', validate(createNoteSchema, 'body'), controller.createNote);

router.get('/', validate(paginationQuerySchema, 'query'), controller.listNotes);

router.get('/:id', validate(noteIdParamSchema, 'params'), controller.getNote);

router.patch(
  '/:id',
  validate(noteIdParamSchema, 'params'),
  validate(updateNoteSchema, 'body'),
  controller.updateNote
);

router.delete('/:id', validate(noteIdParamSchema, 'params'), controller.deleteNote);

module.exports = router;
