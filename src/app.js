const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  // Security headers.
  app.use(helmet());

  // CORS: restrict to an explicit allow-list from env, defaulting to
  // none in production if not configured, and "allow all" in dev/test
  // for convenience.
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : process.env.NODE_ENV !== 'production',
    })
  );

  // Parse JSON bodies with a conservative size limit to reduce the risk
  // of oversized-payload abuse.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', routes);

  // 404 for unmatched routes, then the centralized error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
