// Tests run against a real (isolated) PostgreSQL test database rather
// than mocking Prisma — this is a deliberate choice for an API whose
// core complexity (cursor pagination, ordering, tie-breaking) lives in
// the actual SQL query, which a mock would not meaningfully exercise.
//
// Point DATABASE_URL (via .env.test or the shell environment) at a
// throwaway database before running `npm test`. Never point it at a
// database containing real data — this file wipes the Note table.
require('dotenv').config({ path: '.env.test' });

const prisma = require('../src/utils/prisma');

beforeEach(async () => {
  await prisma.note.deleteMany({});
});

afterAll(async () => {
  await prisma.note.deleteMany({});
  await prisma.$disconnect();
});
