require('dotenv').config();

const createApp = require('./app');
const prisma = require('./utils/prisma');

const PORT = process.env.PORT || 3000;

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Notes API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown: stop accepting new connections, let in-flight
// requests finish, then close the Prisma connection pool before exiting.
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  server.close(async (err) => {
    if (err) {
      console.error('Error while closing HTTP server:', err);
      process.exitCode = 1;
    }

    try {
      await prisma.$disconnect();
      console.log('Database connection closed. Bye!');
    } catch (disconnectErr) {
      console.error('Error while disconnecting Prisma:', disconnectErr);
      process.exitCode = 1;
    } finally {
      process.exit();
    }
  });

  // Failsafe: if something hangs, force-exit after 10s instead of
  // leaving the process stuck forever.
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
