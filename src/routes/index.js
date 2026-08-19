const { Router } = require('express');
const notesRoutes = require('./notes.routes');

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
});

router.use('/notes', notesRoutes);

module.exports = router;
