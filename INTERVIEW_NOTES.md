# Interview Notes — Notes API

Plain-language explanations of this project, tied to the actual code (not generic textbook answers). File paths are given so you can point to the real implementation while explaining.

### What problem does this API solve?

It's a backend service for storing and retrieving text notes (`title` + `content`) over HTTP, with the two things that actually get hard at scale done properly: pagination that stays fast and correct as the table grows, and consistent validation/error handling so API consumers get predictable responses.

### Why Node.js?

Single-language stack for a JSON-in/JSON-out HTTP API, non-blocking I/O suits a service that's mostly waiting on database round-trips, and a huge ecosystem (Express, Prisma, Zod) for exactly this kind of app.

### Why Express?

It's a minimal, unopinionated HTTP framework — routing, middleware chain, and request/response objects, nothing more. That maps directly onto this project's layers: `routes/` register paths, `middleware/` (`validate.js`, `errorHandler.js`) plug into Express's middleware chain, and `controllers/` use `req`/`res` directly. No heavier framework (Nest, etc.) was needed for four CRUD-ish endpoints.

### Why PostgreSQL?

Notes are naturally relational, and the project leans on two Postgres strengths directly: an index (`@@index([createdAt, id])` in `prisma/schema.prisma`) to make the pagination query fast, and `UUID`/timestamp types with real constraints (`NOT NULL`, primary key) instead of an application-enforced schema.

### Why Prisma?

Prisma gives a typed-ish query builder over raw SQL, a migration workflow (`prisma/migrations/`), and — specifically relevant here — a `cursor`/`skip`/`take` API (`src/services/notes.service.js`) that maps cleanly onto cursor pagination without hand-writing `WHERE (created_at, id) < (...)` comparisons.

### What is middleware?

A function with the signature `(req, res, next)` that Express calls in order for a matching route, and which can inspect/modify the request, short-circuit with a response, or call `next()` to continue. This project has two custom middlewares: `validate.js` (validates and stores parsed input on `req.validated`, or responds `422`) and `errorHandler.js` (the last stop for every error — it uses the 4-argument `(err, req, res, next)` signature Express uses to identify error-handling middleware specifically).

### How does request validation work?

`src/schemas/notes.schema.js` defines Zod schemas per input source (`createNoteSchema`, `updateNoteSchema`, `noteIdParamSchema`, `paginationQuerySchema`). Routes attach `validate(schema, source)` (`src/middleware/validate.js`) before the controller. That middleware runs `schema.parse(req[source])`; on success it stores the parsed/coerced value at `req.validated[source]`; on failure it responds `422` with `{ error: { code: 'VALIDATION_ERROR', message, details } }` directly, so the controller is never reached with bad input.

One implementation detail worth mentioning: `req.query` in Express 4 is a getter-only property (no setter), so the middleware deliberately does *not* try `req.query = parsed` — that would silently fail. Validated query data goes on `req.validated.query` instead, which is a pattern that generalizes to `body`/`params` too.

### Why use Zod?

Declarative schemas, built-in coercion/transform (used for the `limit` query param — a string from the URL becomes a validated number with a default), `.strict()` to reject unknown fields, and structured error output (`err.errors`) that's easy to turn into a consistent API response.

### How does the request flow through the application?

`server.js` → `app.js` (mounts `helmet`, `cors`, `express.json()`, then `/api` routes, then 404 handler, then error handler) → `routes/notes.routes.js` (matches method+path) → `validate` middleware (Zod) → `controllers/notes.controller.js` (reads `req.validated`, calls the service, sets status + shapes the JSON response) → `services/notes.service.js` (Prisma call) → Postgres. Any thrown error at any step is caught (directly, or via `asyncHandler` for async controllers) and handled once, centrally, in `errorHandler.js`.

### Why use a service layer?

So `notes.controller.js` only knows about HTTP (status codes, `req`/`res`) and `notes.service.js` only knows about business/database logic (Prisma calls, the pagination algorithm, throwing `ApiError.notFound()` when a row doesn't exist). This is what makes it possible to unit-reason about the pagination logic without thinking about Express at all, and it's the layer that would be reused if this were ever called from something other than HTTP (a queue worker, a CLI, etc.).

### How does cursor pagination work (in this implementation)?

`GET /api/notes` accepts `limit` (validated, defaulted, capped) and an optional `cursor`. If a cursor is present, it's base64url-decoded (`src/utils/cursor.js`) to `{ id, createdAt }`. The service then runs:

```js
prisma.note.findMany({
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  cursor: { id },   // only present if a cursor was supplied
  skip: 1,
});
```

`cursor: { id }` tells Prisma "start at the row with this id, in this order," and `skip: 1` steps past that row so it isn't returned again. Asking for `limit + 1` rows lets the service detect a next page (`hasNextPage`) without a separate `COUNT` query — if the extra row comes back, it's dropped and the last *returned* note is encoded as `nextCursor`.

### Why cursor pagination instead of offset pagination?

Offset pagination (`OFFSET n LIMIT m`) makes the database walk past and discard `n` rows on every request — that gets linearly slower as `n` grows. It's also unstable under concurrent writes: if a row is inserted or deleted while someone is paging through, later pages can repeat or skip rows, because "page 3" is defined by a row *count*, not a fixed position. Cursor pagination anchors to a specific row's unique id, so it stays correct and fast regardless of table size or concurrent writes.

### What exactly is the cursor?

A base64url-encoded JSON object: `{ "id": "<uuid>", "createdAt": "<ISO timestamp>" }` (`src/utils/cursor.js`). Only `id` actually drives the query (it's the unique field Prisma's `cursor` option needs); `createdAt` is included for readability/debugging when decoded, not because the query needs it. Clients are expected to treat it as opaque — pass back exactly what the API gave them.

### Why are database indexes important (here specifically)?

The pagination query orders by `(createdAt DESC, id DESC)` and looks up a specific row by `id` as the anchor. Without an index matching that order, Postgres would have to sort the *entire* table on every single page request. `@@index([createdAt, id])` in `schema.prisma` lets Postgres walk the index directly in the required order and jump straight to the cursor position, so the query stays fast as the table grows into the millions of rows.

### How does Prisma communicate with PostgreSQL?

The Prisma Client (generated from `schema.prisma` into `node_modules/@prisma/client` by `prisma generate`) translates calls like `prisma.note.findMany({...})` into SQL queries and sends them to Postgres over a connection Prisma manages internally (connection pooling included). `src/utils/prisma.js` creates a single `PrismaClient` instance reused across the app (rather than one per request) so that pool is shared, not recreated repeatedly.

### What happens when a note does not exist?

For `GET`/`PATCH`/`DELETE /api/notes/:id`, the service (`getNoteById`, called directly or via `updateNote`/`deleteNote`) does a `findUnique` and throws `ApiError.notFound('Note not found', 'NOTE_NOT_FOUND')` if nothing comes back. That error propagates (via `asyncHandler`) to `errorHandler.js`, which recognizes it as an `ApiError` and responds `404` with `{ error: { code: 'NOTE_NOT_FOUND', message: 'Note not found' } }` — no Express-level try/catch needed in the controller.

### How does centralized error handling work?

`errorHandler.js` is registered last in `app.js`, after all routes and the 404 handler, so Express routes every error there. It checks, in order: is this an `ApiError` I threw on purpose (use its status/code/message directly)? Is this a recognized Prisma error (`P2025` → 404, `P2002` → 409, translated via `fromPrismaError`)? Otherwise, treat it as unexpected: log full detail server-side with `console.error`, but respond with a generic `500 INTERNAL_SERVER_ERROR` — the raw error/stack trace never reaches the client.

### What happens when the database is unavailable?

A Prisma call (e.g. inside `notes.service.js`) rejects with a `PrismaClientInitializationError` (can't reach the database) or similar. Because controllers are wrapped in `asyncHandler`, that rejection is forwarded to `errorHandler.js`, which matches it in `fromPrismaError` and returns `500 DATABASE_ERROR` with a generic message — the client never sees connection strings, hostnames, or driver-level detail.

### How would you scale this API to millions of notes?

The pagination design already targets this (index-backed cursor queries instead of `OFFSET`), but at real scale I'd add: read replicas for `GET` traffic, a cache (Redis) in front of hot single-note lookups, connection pooling via something like PgBouncer in front of Prisma if connection count becomes a bottleneck, and possibly moving full-text search off Postgres onto a dedicated search index if that becomes a feature.

### How would you add authentication?

Add a `User` model and a `userId` foreign key on `Note`; add signup/login endpoints hashing passwords with `bcrypt` (already scoped as a dependency to add only if auth is implemented, per the project constraints); issue a JWT or session cookie; add an `authenticate` middleware (structurally identical to `validate.js` — runs before the controller, either calls `next()` or short-circuits, this time with `401`); and scope every service query (`listNotes`, `getNoteById`, etc.) to `where: { userId: req.user.id }`.

### How would you add search?

For simple cases, a `contains`/`ILIKE` filter on `title`/`content` via Prisma, backed by a Postgres `pg_trgm` index. For real relevance-ranked search, a `tsvector` column with a GIN index (native Postgres full-text search), or offloading to an external index (e.g. Elasticsearch/Meilisearch) if search becomes a primary feature rather than a filter.

### How would you deploy this API?

Containerize it (Dockerfile running `npm ci && npx prisma generate && node src/server.js`), run `prisma migrate deploy` as a release step (not `migrate dev`, which is interactive), point `DATABASE_URL` at a managed Postgres instance (RDS, Neon, Supabase, etc.), and run the container behind a process manager / orchestrator (ECS, Fly.io, Render, k8s) with `PORT` and `CORS_ORIGIN` set via environment variables — the graceful-shutdown handling in `server.js` (`SIGTERM`/`SIGINT`) is specifically there so orchestrators can roll out new versions without dropping in-flight requests.
