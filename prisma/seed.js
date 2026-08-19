const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Fixed sample data so seeding is deterministic and repeatable across
// runs/environments — useful for local development and demos.
const SAMPLE_NOTES = [
  {
    title: 'Welcome to Notes API',
    content: 'This is a sample note created by the seed script. Feel free to edit or delete it.',
  },
  {
    title: 'Grocery list',
    content: 'Eggs, spinach, oat milk, coffee beans, sourdough bread, olive oil.',
  },
  {
    title: 'Sprint planning notes',
    content:
      'Discuss cursor pagination rollout, review error handling middleware, plan test coverage for the notes service.',
  },
  {
    title: 'Book recommendations',
    content: 'Designing Data-Intensive Applications, The Pragmatic Programmer, Clean Architecture.',
  },
  {
    title: 'Interview prep',
    content:
      'Review REST conventions, practice explaining cursor vs offset pagination, walk through the Prisma schema.',
  },
  {
    title: 'Weekend trip ideas',
    content: 'Check weather forecast, book campsite, pack hiking boots, download offline maps.',
  },
  {
    title: 'Refactor TODOs',
    content:
      'Extract shared Zod field rules, add composite index on (createdAt, id), document pagination in the README.',
  },
  {
    title: 'Meeting follow-up',
    content: 'Send recap email, create tickets for action items, schedule follow-up for next Friday.',
  },
];

async function main() {
  console.log('Seeding database...');

  // Idempotent-ish: clear existing notes first so re-running the seed
  // script doesn't keep appending duplicates in local development.
  await prisma.note.deleteMany({});

  // created sequentially (not Promise.all) so createdAt timestamps are
  // naturally ordered, which is more realistic for demoing pagination.
  for (const note of SAMPLE_NOTES) {
    await prisma.note.create({ data: note });
  }

  const count = await prisma.note.count();
  console.log(`Seed complete. ${count} notes in the database.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
