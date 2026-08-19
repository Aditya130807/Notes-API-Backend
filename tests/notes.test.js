const request = require('supertest');
const createApp = require('../src/app');
const prisma = require('../src/utils/prisma');

const app = createApp();

describe('POST /api/notes', () => {
  it('creates a note successfully', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ title: 'Test note', content: 'Some content' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Test note', content: 'Some content' });
    expect(res.body.data.id).toEqual(expect.any(String));
    expect(res.body.data.createdAt).toBeDefined();
  });

  it('rejects invalid note data (missing content)', async () => {
    const res = await request(app).post('/api/notes').send({ title: 'Only a title' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'content' })])
    );
  });

  it('rejects unknown fields', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ title: 'A', content: 'B', notAField: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty title', async () => {
    const res = await request(app).post('/api/notes').send({ title: '', content: 'B' });

    expect(res.status).toBe(422);
  });
});

describe('GET /api/notes/:id', () => {
  it('retrieves a single note', async () => {
    const created = await prisma.note.create({ data: { title: 'Find me', content: 'Body' } });

    const res = await request(app).get(`/api/notes/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.id);
    expect(res.body.data.title).toBe('Find me');
  });

  it('returns 404 for a missing note', async () => {
    const res = await request(app).get('/api/notes/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOTE_NOT_FOUND');
  });

  it('returns a validation error for a non-UUID id', async () => {
    const res = await request(app).get('/api/notes/not-a-uuid');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/notes/:id', () => {
  it('updates a note (partial update)', async () => {
    const created = await prisma.note.create({ data: { title: 'Old', content: 'Old body' } });

    const res = await request(app).patch(`/api/notes/${created.id}`).send({ title: 'New' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
    expect(res.body.data.content).toBe('Old body');
  });

  it('returns 404 when updating a missing note', async () => {
    const res = await request(app)
      .patch('/api/notes/00000000-0000-0000-0000-000000000000')
      .send({ title: 'New' });

    expect(res.status).toBe(404);
  });

  it('rejects an update with no fields', async () => {
    const created = await prisma.note.create({ data: { title: 'Old', content: 'Old body' } });

    const res = await request(app).patch(`/api/notes/${created.id}`).send({});

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/notes/:id', () => {
  it('deletes a note', async () => {
    const created = await prisma.note.create({ data: { title: 'Bye', content: 'Body' } });

    const res = await request(app).delete(`/api/notes/${created.id}`);
    expect(res.status).toBe(204);

    const check = await prisma.note.findUnique({ where: { id: created.id } });
    expect(check).toBeNull();
  });

  it('returns 404 when deleting a missing note', async () => {
    const res = await request(app).delete('/api/notes/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/notes (cursor pagination)', () => {
  it('retrieves notes with default pagination', async () => {
    await prisma.note.create({ data: { title: 'A', content: 'A' } });
    await prisma.note.create({ data: { title: 'B', content: 'B' } });

    const res = await request(app).get('/api/notes');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toEqual({ nextCursor: null, hasNextPage: false });
  });

  it('paginates through multiple pages without duplicates or gaps', async () => {
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.note.create({ data: { title: `Note ${i}`, content: `Content ${i}` } });
    }

    const page1 = await request(app).get('/api/notes?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(2);
    expect(page1.body.pagination.hasNextPage).toBe(true);
    expect(page1.body.pagination.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app).get(
      `/api/notes?limit=2&cursor=${encodeURIComponent(page1.body.pagination.nextCursor)}`
    );
    expect(page2.status).toBe(200);
    expect(page2.body.data.length).toBe(2);
    expect(page2.body.pagination.hasNextPage).toBe(true);

    const page3 = await request(app).get(
      `/api/notes?limit=2&cursor=${encodeURIComponent(page2.body.pagination.nextCursor)}`
    );
    expect(page3.status).toBe(200);
    expect(page3.body.data.length).toBe(1);
    expect(page3.body.pagination.hasNextPage).toBe(false);
    expect(page3.body.pagination.nextCursor).toBeNull();

    // Every note across all pages should be unique — no duplicates, no
    // records skipped.
    const allIds = [...page1.body.data, ...page2.body.data, ...page3.body.data].map((n) => n.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it('does not skip or duplicate records that share the same createdAt', async () => {
    const fixedTimestamp = new Date('2026-01-01T00:00:00.000Z');

    // Force two notes to share the exact same createdAt to simulate a
    // real-world tie, which cannot be reliably reproduced by creating
    // records quickly in a test.
    const noteA = await prisma.note.create({ data: { title: 'Tie A', content: 'A' } });
    const noteB = await prisma.note.create({ data: { title: 'Tie B', content: 'B' } });
    await prisma.note.update({ where: { id: noteA.id }, data: { createdAt: fixedTimestamp } });
    await prisma.note.update({ where: { id: noteB.id }, data: { createdAt: fixedTimestamp } });

    const page1 = await request(app).get('/api/notes?limit=1');
    expect(page1.body.data.length).toBe(1);
    expect(page1.body.pagination.hasNextPage).toBe(true);

    const page2 = await request(app).get(
      `/api/notes?limit=1&cursor=${encodeURIComponent(page1.body.pagination.nextCursor)}`
    );
    expect(page2.body.data.length).toBe(1);

    // The two tied notes must be different from each other across pages.
    expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    expect([page1.body.data[0].id, page2.body.data[0].id].sort()).toEqual(
      [noteA.id, noteB.id].sort()
    );
  });

  it('rejects an invalid cursor', async () => {
    const res = await request(app).get('/api/notes?cursor=not-valid-base64-json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });

  it('rejects a limit above the maximum', async () => {
    const res = await request(app).get('/api/notes?limit=1000');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-numeric limit', async () => {
    const res = await request(app).get('/api/notes?limit=abc');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a limit of zero', async () => {
    const res = await request(app).get('/api/notes?limit=0');
    expect(res.status).toBe(422);
  });
});
