const { PrismaClient } = require('@prisma/client');

// A single PrismaClient instance is reused across the app instead of
// creating a new one per request. Prisma manages an internal connection
// pool, so one client is the recommended pattern.
//
// In test/dev environments with hot-reloading, we also guard against
// creating multiple clients on module re-evaluation.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
