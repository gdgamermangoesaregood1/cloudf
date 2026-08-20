# SecTrain — Local Security Training Lab

A local-first, self-hostable web app for practicing three classic web
vulnerabilities in an isolated, per-player sandbox: **Broken Object-Level
Authorization (IDOR)**, **SQL Injection**, and **Stored Cross-Site
Scripting (XSS)**. Built with Next.js (App Router) + TypeScript +
PostgreSQL, orchestrated with Docker Compose.

> ## ⚠️ LOCAL USE ONLY — DO NOT DEPLOY PUBLICLY
>
> This application intentionally contains real, exploitable vulnerabilities
> as training exercises. Although each challenge is carefully sandboxed
> (see "How the challenges are contained" below), **this project has not
> been hardened for public/production hosting** and must never be exposed
> to the public internet, a shared network, or any environment other than
> your own local machine. There is no public deployment path, no rate
> limiting suitable for internet-facing traffic, and no protection against
> abuse at scale. Run it only via `docker compose up` on `localhost`.

---

## Table of contents

- [What this is](#what-this-is)
- [Quick start (Docker)](#quick-start-docker)
- [Quick start (local Node, no Docker)](#quick-start-local-node-no-docker)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Authentication & session security](#authentication--session-security)
- [The three challenges](#the-three-challenges)
- [How the challenges are contained](#how-the-challenges-are-contained)
- [Dashboard, hints, and reset](#dashboard-hints-and-reset)
- [Project structure](#project-structure)
- [Migrations](#migrations)
- [Testing](#testing)
- [Scripts](#scripts)
- [Known limitations](#known-limitations)

## What this is

Every player self-registers an account. Registration generates a private,
isolated "world" of fake data for that player alone. Three challenges must
be solved **in order** — completing one unlocks the next:

1. **IDOR** — a fictional HR record viewer where object-level authorization
   is missing (but tenant isolation is not).
2. **SQL injection** — a search box that concatenates user input directly
   into SQL, deliberately, but is boxed in by a separate schema, a
   least-privileged database role, and PostgreSQL Row-Level Security (RLS).
3. **Stored XSS** — a guestbook message rendered unsanitized, but only
   inside a sandboxed, no-`allow-same-origin` `<iframe>` with a locked-down
   Content-Security-Policy, completed via a safe, knowledge-based server
   callback.

## Quick start (Docker)

Requires Docker and Docker Compose.

```bash
cp .env.example .env
# Edit .env and set real values for:
#   POSTGRES_SUPERUSER_PASSWORD, APP_DB_PASSWORD, SQLI_DB_PASSWORD

docker compose up --build
```

This starts three services:

1. `db` — PostgreSQL 16. On first boot, `db/init/001_create_roles.sh`
   creates the two least-privilege application roles (`app_role`,
   `sqli_role`) using the passwords from your `.env`.
2. `migrate` — a one-off container that runs `db/migrate.ts` (using the
   Postgres **superuser**, never the app's runtime credentials) to create
   all tables, schemas, grants, and Row-Level Security policies.
3. `web` — the Next.js app, running with only the least-privileged
   `app_role`/`sqli_role` credentials (never the superuser).

Once `migrate` completes and `web` is healthy, open
**http://localhost:3000** (bound to `127.0.0.1` only — see the warning
above). Register an account and start with the first challenge.

To stop: `docker compose down`. To wipe all data and start fresh:
`docker compose down -v`.

## Quick start (local Node, no Docker)

If you already have PostgreSQL 16+ running locally:

```bash
cp .env.example .env
# Set POSTGRES_HOST/PORT/DB to your local instance, plus the three
# password variables.

npm install
npm run seed:roles   # creates app_role / sqli_role (idempotent)
npm run migrate       # creates tables, schemas, grants, RLS policies
npm run dev
```

Then open http://localhost:3000.

## Environment variables

See `.env.example` for the full, commented list. Highlights:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL; used for cookie scoping and CSRF origin checks. |
| `COOKIE_SECURE` | Set `true` only if serving over HTTPS locally. |
| `SESSION_TTL_HOURS` | How long a login session lasts. |
| `POSTGRES_SUPERUSER(_PASSWORD)` | Used **only** by the one-off `migrate` step/init script — never by the running app. |
| `APP_DB_USER` / `APP_DB_PASSWORD` | Least-privilege role the app server uses for everything except the SQLi challenge. |
| `SQLI_DB_USER` / `SQLI_DB_PASSWORD` | Least-privilege, read-only role used *only* by the SQL-injection challenge endpoint. |
| `XSS_RENDER_TOKEN_TTL_MINUTES` | Lifetime of a one-time XSS "render token" (see below). |

## Architecture

- **Next.js 15 (App Router) + TypeScript**, Server Components for
  data-fetching, Route Handlers for mutations/API endpoints.
- **PostgreSQL**, accessed via `pg` through **two separate connection
  pools** with different, least-privileged roles (`app_role`, `sqli_role`)
  — see [How the challenges are contained](#how-the-challenges-are-contained).
- **Hand-written SQL migrations** (`db/migrations/*.sql`), applied by a
  small custom runner (`db/migrate.ts`) rather than an ORM, so the
  role/schema/RLS boundaries are explicit and auditable.
- **`src/middleware.ts`** runs on the Edge runtime and only performs
  *optimistic* cookie-presence redirects (per Next.js's recommended
  pattern) plus applies security headers (CSP, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`) to every response. It never
  talks to the database.
- **Authoritative auth/authorization checks** always happen server-side in
  Server Components / Route Handlers (`getCurrentSession()`,
  `requireChallengeAccess()`), which is the only place allowed to query
  the database.

## Authentication & session security

- **Registration/login**: Argon2id password hashing (`@node-rs/argon2`,
  19 MiB memory / 2 iterations), Zod-validated inputs, a common-password
  denylist, and constant-time-ish handling of "user not found" (a dummy
  hash verification runs so login timing doesn't reveal whether a username
  exists).
- **Sessions**: an opaque, 256-bit random token is set in an `HttpOnly`,
  `SameSite=Lax` cookie. The database only ever stores a SHA-256 hash of
  that token (`sessions.token_hash`) — a database leak alone cannot be
  replayed as a live session. Sessions have a fixed expiry
  (`SESSION_TTL_HOURS`) and can be revoked (`sessions.revoked_at`), e.g. on
  logout.
- **CSRF protection**: a per-session `csrf_secret` is issued alongside the
  session and exposed to the browser via a second, readable
  (non-`HttpOnly`) cookie. Every state-changing request (logout, saving a
  guestbook message, resetting progress) must send that value back in an
  `x-csrf-token` header; the server checks it against **both** the cookie
  **and** the session's own stored secret (a stronger variant of the
  double-submit pattern), plus a same-origin `Origin` header check.
- **Rate limiting**: a lightweight in-memory limiter throttles
  registration and login attempts (per-IP and per-username). This is
  appropriate for a single local instance and explicitly **not** designed
  for a public/multi-instance deployment.
- **Current-level access checks**: every challenge page/route calls
  `requireChallengeAccess(userId, key)`, which re-derives "is this
  challenge unlocked AND are all earlier ones completed" straight from the
  database on every request — a tampered client can't skip ahead.

## The three challenges

### 1. IDOR — Confidential Records

Each player's world contains a few "public" HR directory records plus one
confidential record that requires manager clearance. The API correctly
scopes every query to the caller's own world (`owner_id = current user`),
**but never checks the clearance flag** — so a player who simply
increments the record number in the URL can view the confidential record
in their own world. This models a real BOLA bug: correct tenant isolation,
missing object-level authorization.

### 2. SQL Injection — Directory Search

A "search" feature builds its SQL query by string concatenation:

```ts
const query = `SELECT id, title, description FROM items WHERE title ILIKE '%${term}%' ORDER BY id`;
```

The visible columns never include a hidden `secret_flag` column — but a
`UNION SELECT` injection can pull it into the result set. This is
contained by the database itself, not by application logic (see below).

### 3. Stored XSS — Guestbook

Players can post a guestbook message that is stored and later rendered
**completely unsanitized**. The rendered output is only ever shown inside
a sandboxed `<iframe sandbox="allow-scripts">` (no `allow-same-origin`),
served with an extremely strict, isolated Content-Security-Policy. A
successful payload proves itself by reading a per-render secret flag
(injected as `window.__CHALLENGE_FLAG__`) and reporting it, along with a
one-time render token, to `/api/challenges/xss/callback` — a "safe server
callback" that authenticates purely by token+flag knowledge (never by
cookies, since the sandboxed frame has none).

## How the challenges are contained

**IDOR** is contained by construction: every query is scoped to
`owner_id = <the calling player's own id>`. The bug (missing clearance
check) can only ever expose data *within that same player's own
generated world* — it is structurally impossible for it to reach another
player's records.

**SQL injection** is contained by a hard database boundary, not by
"careful" application code:

- The vulnerable table (`sqli_challenge.items`) lives in its **own
  schema**, separate from `public.users` / `public.sessions`.
- The endpoint queries through **`sqli_role`**, a Postgres role that has
  `USAGE` on that one schema and `SELECT` on that one table — and
  **nothing else**. Even a fully successful injection (e.g. a UNION
  pulling from `public.users`) is refused by PostgreSQL itself
  ("permission denied"), independent of any application code.
- **Row-Level Security** (`ALTER TABLE ... FORCE ROW LEVEL SECURITY` +
  a policy keyed on a `set_config('app.current_user_id', ...)` session
  variable) additionally scopes every row — including anything an
  injected `UNION`/subquery adds — to the requesting player's own rows,
  so one player's injection can never read another player's flag.
- A separate, least-privileged `app_role` handles seeding/reset (via
  column-level `SELECT (user_id)` plus `INSERT`/`UPDATE`/`DELETE`) but can
  **never read** `title`/`description`/`secret_flag` back out — even the
  trusted app code path can't peek at flags outside the intentionally
  vulnerable query.

**Stored XSS** is contained by the browser sandbox + CSP + a safe
callback, not by escaping the payload (there is none):

- The preview is rendered inside `<iframe sandbox="allow-scripts">`
  — no `allow-same-origin`, `allow-forms`, or `allow-popups` — giving it
  an **opaque ("null") origin** with no access to cookies, storage, or the
  parent page/DOM.
- The framed document's own response sets
  `Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; ...`
  — any script it runs can reach only this app's own origin, never a
  third-party exfiltration endpoint, and the document can only ever be
  embedded by this app itself.
- Completion is proven via a **one-time-use, short-lived render token**
  paired with a per-render secret flag — never by ambient credentials,
  since the sandbox has none to offer anyway.

## Dashboard, hints, and reset

- `/dashboard` shows all three challenges with a **Locked / Unlocked /
  Completed** badge, driven entirely by server-side state.
- Each unlocked challenge has a collapsible **Hints** section (progressive,
  non-spoiling nudges).
- **Reset progress** regenerates a brand-new IDOR world and SQLi flags,
  clears the guestbook message/render tokens, and re-locks everything
  except the first challenge — scoped strictly to your own account.

## Project structure

```
db/
  init/           # docker-entrypoint-initdb.d bootstrap (creates roles)
  migrations/     # numbered, idempotent SQL migrations
  migrate.ts      # migration runner (superuser credentials only)
  apply-roles.ts  # standalone role-bootstrap for non-Docker Postgres
src/
  app/            # Next.js App Router: pages + API route handlers
  components/     # client/server React components
  lib/
    auth/         # password hashing, sessions, tokens, validation
    challenges/   # per-challenge domain logic (idor.ts, sqli.ts, xss.ts, ...)
    db/           # connection pools (least-privilege, injectable for tests)
    security/     # CSRF, CSP/security headers, rate limiting
  middleware.ts   # Edge-only optimistic auth redirect + security headers
tests/
  unit/           # pure-logic unit tests (no database)
  integration/    # exercise real migrations + RLS/grants via pglite
```

## Migrations

Migrations are plain, numbered SQL files in `db/migrations/`, applied by
`db/migrate.ts` in filename order and tracked in a `schema_migrations`
table (idempotent — re-running `npm run migrate` only applies new files).
They run using the Postgres **superuser** connection, since creating
schemas/roles/grants/RLS policies requires elevated privileges that the
app's own runtime roles intentionally do not have.

## Testing

```bash
npm run lint        # ESLint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit
npm test             # Vitest: unit + integration
npm run build        # Next.js production build
```

Integration tests spin up a real, ephemeral, fully-migrated PostgreSQL
database per test using [`@electric-sql/pglite`](https://pglite.dev)
(a WASM build of real Postgres) — **no Docker is required to run the test
suite**. They exercise the actual production code paths (via a
test-only pool-injection seam, `__setPoolsForTests`) including:

- sequential challenge unlocking and defense-in-depth access checks,
- the IDOR flaw and its containment to one player's own world,
- the SQL injection exploit (error-based and UNION-based) and its
  containment via schema/role/RLS boundaries,
- the stored-XSS render-token/callback flow, including expiry and
  one-time-use enforcement.

> **Note on this build environment:** Docker was not available in the
> sandbox used to build this project, so the full `docker compose up`
> stack itself could not be smoke-tested here. The SQL migrations, roles,
> grants, and RLS policies were validated instead by running them (via
> `db/apply-roles.ts` + `db/migrate.ts`'s exact SQL files) against a real
> Postgres engine (pglite) in the integration tests above, and
> `docker-compose.yml`/`Dockerfile` were syntax-validated. If you have
> Docker installed, running `docker compose up --build` end-to-end is the
> recommended final check before use.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm start` | Run a production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm test` / `npm run test:watch` | Vitest. |
| `npm run migrate` | Apply pending SQL migrations (superuser). |
| `npm run seed:roles` | Create `app_role`/`sqli_role` outside Docker. |
| `npm run format` | Prettier, write mode. |

## Known limitations

- Rate limiting is in-memory and per-process — fine for one local
  instance, not for multi-instance/public deployments (which are out of
  scope; see the warning at the top).
- There is no email verification or password reset flow — this is a
  training sandbox, not an account-management product.
- The Docker Compose stack was not smoke-tested with a real Docker engine
  in the environment this project was built in (see
  [Testing](#testing)); please run `docker compose up --build` yourself
  and confirm before relying on it.
