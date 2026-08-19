# Notes API

A production-oriented RESTful API for managing notes, built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma**. The project focuses on doing a small feature set *properly*: correct cursor-based pagination, request validation, centralized error handling, and a clean layered structure — rather than piling on unnecessary features.

## 1. Project Overview

The API exposes CRUD endpoints for a `Note` resource (`title`, `content`). The main technical focus of this project is **cursor-based pagination**, implemented correctly (deterministic ordering, no duplicate/skipped records on timestamp ties) rather than the more common but less scalable offset (`page`/`skip`) approach.

Authentication is intentionally **out of scope** — see [Design Decisions](#15-design-decisions).

## 2. Features

- Create, read (single + paginated list), update (partial), and delete notes
- Cursor-based pagination with `limit` and `cursor` query params
- Request validation with Zod (body, params, and query string)
- Centralized error handling with a consistent JSON error shape
- Layered architecture: routes → controllers → services → Prisma
- Security basics: `helmet`, request body size limit, configurable CORS
- Graceful server shutdown (`SIGINT`/`SIGTERM`)
- Deterministic Prisma seed script
- Supertest + Jest integration tests against a real test database

## 3. Tech Stack

| Concern             | Choice                     |
|---------------------|-----------------------------|
| Runtime              | Node.js                    |
| Web framework        | Express.js                 |
| Language              | JavaScript (CommonJS)      |
| Database              | PostgreSQL                 |
| ORM                    | Prisma                     |
| Validation             | Zod                         |
| Config                 | dotenv                     |
| Security headers       | helmet                     |
| Testing                | Jest + Supertest           |

## 4. Architecture

```
Request
  │
  ▼
routes/*.routes.js        — declares endpoints, wires middleware + controller
  │
  ▼
middleware/validate.js    — parses & validates req.body/query/params with Zod
  │
  ▼
controllers/*.controller.js — reads req.validated, calls service, shapes HTTP response
  │
  ▼
services/*.service.js     — business logic + Prisma queries
  │
  ▼
Prisma Client → PostgreSQL
```

Errors thrown anywhere in this chain (validation failures, `ApiError`s, Prisma errors, or unexpected bugs) are caught by a single centralized `middleware/errorHandler.js`.

```mermaid
flowchart TD
    A[Client] -->|HTTP request| B[Express app.js]
    B --> C[helmet / cors / json body parser]
    C --> D[Route: notes.routes.js]
    D --> E[validate middleware - Zod]
    E -->|invalid| F[422 Validation Error response]
    E -->|valid| G[Controller]
    G --> H[Service layer]
    H --> I[(Prisma Client)]
    I --> J[(PostgreSQL)]
    H -->|throws ApiError / Prisma error| K[errorHandler middleware]
    G -->|success| L[JSON response]
    K --> M[Consistent error JSON response]
```

## 5. Database Schema

```prisma
model Note {
  id        String   @id @default(uuid())
  title     String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([createdAt, id])
}
```

- `id` — UUID primary key.
- `createdAt` / `updatedAt` — managed automatically by Prisma.
- `@@index([createdAt, id])` — a composite index supporting the exact ordering used by the cursor-pagination query (`ORDER BY "createdAt" DESC, "id" DESC`), so pagination stays fast as the table grows instead of degrading into a full table scan + sort.

## 6. API Endpoints

All responses use a consistent envelope:

- Single resource: `{ "data": {...} }`
- Collections: `{ "data": [...], "pagination": { "nextCursor": ..., "hasNextPage": ... } }`
- Errors: `{ "error": { "code": ..., "message": ..., "details"?: [...] } }`

| Method | Path              | Description                          |
|--------|-------------------|---------------------------------------|
| POST   | `/api/notes`      | Create a note                        |
| GET    | `/api/notes`      | List notes (cursor-paginated)        |
| GET    | `/api/notes/:id`  | Get a single note                    |
| PATCH  | `/api/notes/:id`  | Partially update a note              |
| DELETE | `/api/notes/:id`  | Delete a note                        |
| GET    | `/api/health`     | Liveness check                       |

## 7. Example Requests / Responses

**Create a note**

```
POST /api/notes
Content-Type: application/json

{ "title": "Groceries", "content": "Eggs, milk, bread" }
```

```json
201 Created
{
  "data": {
    "id": "6a6f0f2e-6e34-4e3e-9a55-9c9f3d9b8a11",
    "title": "Groceries",
    "content": "Eggs, milk, bread",
    "createdAt": "2026-08-19T10:00:00.000Z",
    "updatedAt": "2026-08-19T10:00:00.000Z"
  }
}
```

**List notes (paginated)**

```
GET /api/notes?limit=2
```

```json
200 OK
{
  "data": [
    { "id": "...", "title": "...", "content": "...", "createdAt": "...", "updatedAt": "..." },
    { "id": "...", "title": "...", "content": "...", "createdAt": "...", "updatedAt": "..." }
  ],
  "pagination": {
    "nextCursor": "eyJpZCI6Ii4uLiIsImNyZWF0ZWRBdCI6Ii4uLiJ9",
    "hasNextPage": true
  }
}
```

```
GET /api/notes?limit=2&cursor=eyJpZCI6Ii4uLiIsImNyZWF0ZWRBdCI6Ii4uLiJ9
```

**Validation error**

```json
422 Unprocessable Entity
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "content", "message": "content is required" }]
  }
}
```

**Not found**

```json
404 Not Found
{ "error": { "code": "NOTE_NOT_FOUND", "message": "Note not found" } }
```

## 8. Cursor Pagination Explanation

**What cursor pagination is:** instead of asking the database for "page 3" via `OFFSET 40 LIMIT 20` (which requires scanning and discarding the first 40 rows every time), the client sends an opaque **cursor** that marks its exact position in the result set. The server asks the database for rows *after* that position.

**Why it's preferable to offset pagination for large datasets:**
- `OFFSET` gets linearly slower as the offset grows — the database still has to walk past every skipped row.
- Offset pagination is unstable under concurrent writes: if a row is inserted or deleted while a user is paging through results, later pages can show duplicates or skip records entirely. Cursor pagination anchors to a specific row instead of a row *count*, so it doesn't drift.

**What the cursor represents:** a base64url-encoded JSON object, `{ id, createdAt }`, identifying the last note the client has already seen (see `src/utils/cursor.js`). Only `id` is strictly required to drive the query — it's included because `id` is the unique field Prisma's `cursor` option anchors on — but `createdAt` is included too so the cursor is self-describing for debugging. Clients should treat it as opaque and never construct one manually.

**How Prisma implements the query** (`src/services/notes.service.js`):

```js
const rows = await prisma.note.findMany({
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,          // fetch one extra row to detect a next page
  cursor: { id: decodedId }, // anchor: the exact row the client last saw
  skip: 1,                   // skip the anchor row itself
});
```

- **Deterministic ordering:** ordering by `createdAt DESC` alone is not enough — two notes can share the same millisecond timestamp. Adding `id DESC` as a tie-breaker guarantees a total order, so pagination never produces duplicate or skipped records, even under timestamp collisions (covered by a dedicated test).
- **`limit + 1` trick:** rather than issuing a second `COUNT` query to know whether more data exists, the service asks for one row more than requested. If that extra row comes back, `hasNextPage` is `true` and the extra row is dropped before returning to the client.
- **Why `cursor: { id }` and not `cursor: { createdAt }`:** Prisma's `cursor` option requires a unique field (or unique compound key) to locate the exact anchor row. Because it locates the row by its unique `id` — not by re-comparing `createdAt` values — it remains correct even when multiple rows share a `createdAt`.

## 9. Validation Strategy

All request input (body, route params, and query string) is validated with **Zod** schemas in `src/schemas/notes.schema.js`, applied via a small reusable `validate(schema, source)` middleware (`src/middleware/validate.js`).

- Schemas use `.strict()` to reject unknown fields rather than silently dropping them.
- `req.query` is a getter-only property in Express 4 (no setter), so the middleware does not attempt `req.query = parsed`; instead it stores parsed/validated data on `req.validated.{body|params|query}`, which controllers read from. This also keeps a clear boundary between "raw request input" and "validated input."
- Validation failures short-circuit to a `422` with a consistent `VALIDATION_ERROR` shape, including a `details` array with per-field messages — before any controller or database code runs.

**Why Zod:** schema-first validation with good TypeScript-adjacent DX (even in a JS project), first-class `.transform()`/`.pipe()` support (used to coerce and default the `limit` query param), and readable, composable schemas without a lot of boilerplate.

## 10. Error Handling

`src/middleware/errorHandler.js` is the single place that turns any error into an HTTP response:

1. **`ApiError`** (`src/utils/ApiError.js`) — thrown intentionally in services (e.g. `ApiError.notFound(...)`) — is mapped directly to its `statusCode`/`code`/`message`.
2. **Known Prisma errors** (`Prisma.PrismaClientKnownRequestError`) are translated — e.g. `P2025` (record not found on update/delete) → `404`, `P2002` (unique constraint) → `409`.
3. **Anything else** (a genuine bug, a database being unreachable, etc.) is logged server-side with full detail and returned to the client as a generic `500 INTERNAL_SERVER_ERROR` — **no stack traces or internals are ever sent in the response body**.

Async controllers are wrapped in `asyncHandler` (`src/utils/asyncHandler.js`) so a rejected promise is automatically forwarded to this middleware via `next(err)`, instead of every controller needing its own `try/catch`.

## 11. Environment Setup

1. Copy the example env file: `cp .env.example .env`
2. Set `DATABASE_URL` to a real PostgreSQL connection string.
3. (Optional) Copy `.env.test.example` to `.env.test` for running the test suite against a separate, disposable database.

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/notes_api?schema=public"
PORT=3000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173"
```

No real credentials are committed — `.env` and `.env.test` are git-ignored.

## 12. Database Migration Instructions

```bash
npm install
npm run db:generate      # generate the Prisma client
npm run db:migrate       # apply migrations to your local database (dev)
# or, in CI/production:
npm run db:migrate:deploy
```

The initial migration lives in `prisma/migrations/20260101000000_init/` and creates the `Note` table plus the `(createdAt, id)` composite index described above.

## 13. How to Run Locally

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL
npm run db:generate
npm run db:migrate
npm run db:seed             # optional: adds sample notes
npm run dev                 # starts on http://localhost:3000 with auto-reload
# or: npm start
```

## 14. How to Run Tests

```bash
cp .env.test.example .env.test   # point at a disposable test database
npm run db:generate
npm run db:migrate:deploy        # ensure the test DB schema is up to date
npm test
```

Tests run against a real (isolated) PostgreSQL database rather than a mocked Prisma client, because the core complexity of this project — correct cursor pagination and ordering — lives in the actual SQL query and wouldn't be meaningfully exercised by a mock. `tests/setup.js` clears the `Note` table before each test so tests don't depend on or interfere with each other.

## 15. Design Decisions

- **No authentication.** Adding real auth (sessions/JWT, password hashing, protected routes) would roughly double the surface area of this project without adding to what it's meant to demonstrate: correct pagination, validation, and error handling on a clean REST API. It is explicitly out of scope here; see [Future Improvements](#16-possible-future-improvements) for how it would be added.
- **Service layer, even for a small app.** Controllers stay HTTP-only (status codes, request/response shaping); all Prisma calls and business rules live in `src/services/notes.service.js`. This keeps controllers thin and testable, and means the pagination logic isn't tangled up with Express-specific code.
- **`limit + 1` over a `COUNT` query.** Cheaper than a second round-trip to determine `hasNextPage`.
- **Cursor anchored on `id`, not `createdAt`.** Prisma's `cursor` requires a unique field; anchoring on the unique `id` (with `createdAt` used only for ordering) is what makes pagination correct under timestamp ties.
- **`.strict()` Zod schemas.** Silently ignoring unknown fields can hide client bugs; rejecting them surfaces mistakes early.
- **No offset/page-based pagination.** Deliberately not offered as an alternative — mixing both would double the surface area for a pattern this project intentionally shows done one, correct way.

## 16. Possible Future Improvements

- Authentication (e.g. JWT) and per-user note ownership.
- Full-text search (PostgreSQL `tsvector` or an external search index).
- Soft deletes (`deletedAt`) instead of hard deletes.
- Rate limiting (e.g. `express-rate-limit`) in front of write endpoints.
- OpenAPI/Swagger spec generated from the Zod schemas.
- Structured logging (e.g. `pino`) and request tracing.
- CI pipeline running `lint` + `test` on every PR.

---

## Project Structure

```
src/
  controllers/   # HTTP request/response handling
  routes/        # endpoint definitions
  middleware/    # validation, error handling
  schemas/       # Zod validation schemas
  services/      # business/database logic (Prisma)
  utils/         # ApiError, asyncHandler, cursor encode/decode, prisma client
  app.js         # Express app construction (no listen — testable)
  server.js      # entrypoint: loads env, starts server, graceful shutdown
prisma/
  schema.prisma
  seed.js
  migrations/
tests/
  notes.test.js
  setup.js
```

## Note on This Environment

This project was built and syntax-checked in a sandboxed environment without outbound network access, so `npm install`, `prisma generate`, `prisma migrate`, `npm run db:seed`, `npm test`, and `npm run lint` could not actually be executed here (npm registry access returned `403 Forbidden`). Every file was written by hand and each `.js` file was verified with `node --check` for syntax correctness. See `INTERVIEW_NOTES.md` and the final summary message for exactly what was and wasn't verified, and what to run locally to complete verification.
