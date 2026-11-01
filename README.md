# SecTrain — Local Security Training Lab

A local-first, self-hostable web app for practicing 30 web-security
vulnerability classes in a fixed, increasingly difficult curriculum. Every
target is isolated per player; dangerous server-side categories use
deterministic simulators instead of the host network, filesystem, shell, XML
parser, template engine, or package manager. Built with Next.js (App Router)
and TypeScript plus PostgreSQL, orchestrated with Docker Compose.

> **Private training only.** The app intentionally includes exploitable
> exercises. Run it locally or behind Cloudflare Access restricted to trusted
> participants. Application login alone is not the private-access boundary;
> the deployment changes do not harden it for unrestricted public hosting.

---

## Table of contents

- [What this is](#what-this-is)
- [Quick start (Docker)](#quick-start-docker)
- [Quick start (local Node, no Docker)](#quick-start-local-node-no-docker)
- [Private Cloudflare deployment](#private-cloudflare-deployment)
- [Environment variables](#environment-variables)
- [Billing and challenge access](#billing-and-challenge-access)
- [Architecture](#architecture)
- [Authentication & session security](#authentication--session-security)
- [The 30 challenges](#the-30-challenges)
- [How the challenges are contained](#how-the-challenges-are-contained)
- [Dashboard, hints, and reset](#dashboard-hints-and-reset)
- [Project structure](#project-structure)
- [Migrations](#migrations)
- [Testing](#testing)
- [Scripts](#scripts)
- [Known limitations](#known-limitations)

## What this is

Every player self-registers an account. Registration generates a private,
isolated "world" of fake data for that player alone. Thirty challenges must
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
4. **CSRF** — a state-changing legacy GET route limited to fictional
   notification settings.
5. **API IDOR**
6. **SSRF**
7. **LFI / RFI**
8. **Command injection**
9. **XXE**
10. **Server-side template injection**
11. **Cryptographic failure**
12. **Security misconfiguration**
13. **Authentication failure**
14. **Software supply-chain failure**
15. **Exceptional-condition mishandling**
16. **Mass assignment**
17. **Open redirect**
18. **CORS misconfiguration**
19. **JWT algorithm confusion**
20. **NoSQL injection**
21. **GraphQL authorization**
22. **Coupon race condition**
23. **Prototype pollution**
24. **Unsafe deserialization**
25. **Request smuggling**
26. **Cache poisoning**
27. **Host header injection**
28. **OAuth state/redirect failure**
29. **WebSocket authorization**
30. **Multi-step capstone**

Levels 5–15 use per-player, deterministic virtual targets. They teach the
input shape and observable effect of each flaw without issuing arbitrary
network requests, reading local files, executing commands, resolving XML
entities, evaluating templates, weakening the real login system, or loading
untrusted dependencies.

## Quick start (Docker)

Requires Docker and Docker Compose.

```bash
cp .env.example .env
# Edit .env and set real values for:
#   POSTGRES_SUPERUSER_PASSWORD, APP_DB_PASSWORD, SQLI_DB_PASSWORD,
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID

docker compose up --build
```

Wrap password values containing `$` or `#` in single quotes in `.env` so
Docker Compose treats them literally (for example,
`APP_DB_PASSWORD='your$value'`).

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

If PostgreSQL reports `password authentication failed` after you change a
database password in `.env`, remember that an existing `pgdata` volume keeps
the password with which its roles were originally created. For a disposable
local lab, run `docker compose down -v` and start again. This deletes local
accounts and progress; do not use `-v` when that data must be preserved.

## Quick start (local Node, no Docker)

If you already have PostgreSQL 16+ running locally:

```bash
cp .env.example .env
# Set POSTGRES_HOST/PORT/DB to your local instance, then configure the
# password and Stripe variables described below.

npm install
npm run seed:roles   # creates app_role / sqli_role (idempotent)
npm run migrate       # creates tables, schemas, grants, RLS policies
npm run dev
```

Then open http://localhost:3000.

## Private Cloudflare deployment

The app uses OpenNext to run its Next.js server on Cloudflare Workers.
Intentional vulnerabilities and challenge containment are unchanged.
Argon2id now uses pure JavaScript with the same parameters and encoding;
existing password hashes generated by this app still verify.

1. Use a **Workers Paid** plan: JavaScript Argon2 exceeds the free plan's
   request CPU allowance. `wrangler.jsonc` allows up to 30 seconds of CPU per
   request without weakening the password-hashing parameters.
2. Provision a dedicated, TLS-enabled PostgreSQL server reachable from
   Workers. It must permit creating the roles, schemas, grants and RLS
   policies in this repository. Use a **direct PostgreSQL endpoint**, not a
   transaction pooler or Hyperdrive: the SQLi containment binds its context
   to a backend PID across session commands and a transaction. Keep the
   `app_role` and `sqli_role` accounts separate.
3. In your local, uncommitted `.env`, set the hosted database host, port,
   database, role passwords and migration-owner credentials, and set
   `POSTGRES_SSL=require`. Run `npm run seed:roles` and `npm run migrate`
   locally to initialize it. **Never give the Worker the owner/superuser
   credentials.** The database must have a trusted TLS certificate; do not
   disable certificate verification.
4. In Cloudflare Zero Trust, create a self-hosted **Access application** for
   your intended custom hostname, covering all paths, and restrict its Allow
   policy to your approved participants. Do not create a public Bypass rule.
   Configure this before routing traffic to the Worker.
5. Set the Worker's runtime variables/secrets in Cloudflare:
   `APP_URL=https://your-protected-hostname`, `POSTGRES_HOST`, `POSTGRES_PORT`,
   `POSTGRES_DB`, `APP_DB_USER=app_role`, `SQLI_DB_USER=sqli_role`,
   `APP_DB_PASSWORD`, `SQLI_DB_PASSWORD`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID`. Store passwords and Stripe
   keys as encrypted **secrets**, not committed config or build-time values.
   Use Stripe test mode for private training. The config already enables
   secure cookies, TLS and single-use database connections for Workers.
6. In **Workers Builds**, use build command `npm run build:cloudflare` and
   deploy command `npm run deploy`, with the repository root as the working
   directory. Do not use `.next` as a static output directory. OpenNext
   produces `.open-next/worker.js` and `.open-next/assets`.
7. Add your Access-protected **custom domain** to the `cloudf` Worker.
   `workers_dev=false` and `preview_urls=false` deliberately disable the
   alternate public URLs. Keep them disabled in the dashboard too. Verify
   an unauthenticated browser receives an Access challenge on the hostname
   before inviting anyone.

For a manual build/upload:

```bash
npm ci
npm run build:cloudflare
npm run deploy
```

For a local Workers preview, copy `.env.example` to the ignored `.dev.vars`,
fill in the hosted database and Stripe test credentials, and set
`APP_URL=http://localhost:8787`, `COOKIE_SECURE=false`,
`POSTGRES_SSL=require` and `DB_POOL_MODE=single-use`. After building, run
`npm run preview -- --port 8787`. Local `npm run dev` and Docker still work.

Access protects the Stripe webhook too. For initial private testing, use
Stripe CLI forwarding to the local preview instead of opening an Access
bypass. Stripe's direct webhook delivery needs a separately designed,
tightly scoped ingress policy before hosted billing can synchronize.
In-memory app rate limits are not shared across Worker instances; Access
is mandatory, and this is not a public-production hardening.

## Environment variables

See `.env.example` for the full, commented list. Highlights:

| Variable                            | Purpose                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `APP_URL`                           | Public base URL; used for cookie scoping and CSRF origin checks.                                             |
| `COOKIE_SECURE`                     | Set `true` only if serving over HTTPS locally.                                                               |
| `SESSION_TTL_HOURS`                 | How long a login session lasts.                                                                              |
| `POSTGRES_SUPERUSER(_PASSWORD)`     | Used **only** by the one-off `migrate` step/init script — never by the running app.                          |
| `APP_DB_USER` / `APP_DB_PASSWORD`   | Least-privilege role the app server uses for everything except the SQLi challenge.                           |
| `SQLI_DB_USER` / `SQLI_DB_PASSWORD` | Least-privilege, read-only role used _only_ by the SQL-injection challenge endpoint.                         |
| `XSS_RENDER_TOKEN_TTL_MINUTES`      | Lifetime of a one-time XSS "render token" (see below).                                                       |
| `STRIPE_SECRET_KEY`                 | Stripe `sk_test_…` or `sk_live_…` secret API key used server-side for Checkout and the portal.               |
| `STRIPE_WEBHOOK_SECRET`             | `whsec_…` signing secret for the raw-body `/api/billing/webhook` endpoint.                                   |
| `STRIPE_PRICE_ID`                   | `price_…` ID for the recurring USD $4/month Price; it must belong to the same Stripe mode as the secret key. |

## Billing and challenge access

Registration starts one 15-day trial immediately; it is not a Stripe trial.
During it, all sequentially unlocked challenges are available. After it
expires, **all 30 levels** (pages and challenge APIs, including level 1) require
an active subscription. The dashboard still shows every title, difficulty, and
summary, but hides links, controls, reset, and hints.

An active Stripe subscription also unlocks a collapsible solution guide on
every challenge with the answer, an explanation of why the exploit works, and
the standard real-world remediation. Trial-only accounts can solve every level
but do not receive these answer guides. The promotional code `duck` can be
redeemed once per account on `/billing`; it grants permanent promotional
premium access and the same solution guides without creating Stripe billing
records.

The normal billing path is a real Stripe integration (use Stripe test mode for
local testing and live mode only in an appropriately secured environment):

1. In Stripe, create a Product with a recurring Price of **USD $4.00 monthly**.
2. Copy its `price_…` ID and the same-mode `sk_test_…`/`sk_live_…` key into
   `.env`. Do not mix test and live objects.
3. Install and authenticate the
   [Stripe CLI](https://docs.stripe.com/stripe-cli), start the app, then run:

   ```bash
   npm run stripe:webhook
   ```

   This forwards events to
   `http://localhost:3000/api/billing/webhook`. Copy the command's `whsec_…`
   signing secret to `STRIPE_WEBHOOK_SECRET`, then restart the app. The handler
   consumes `checkout.session.completed` and
   `customer.subscription.created|updated|deleted`.

4. Subscribe from `/billing` through Stripe Checkout. The same page opens
   Stripe's customer portal for payment and cancellation management.

For a persistent endpoint, configure the same webhook URL and four event types
in the Stripe Dashboard and use that endpoint's signing secret (CLI and
Dashboard endpoint secrets differ). In `NODE_ENV=development` only, `/billing`
also exposes database-backed **simulation** buttons for local testing without a
Stripe transaction. Simulation is separate from Stripe mode and its API returns
404 unless `NODE_ENV` is exactly `development`; the Docker Compose `web` service
runs with `NODE_ENV=production`, so it always uses the real integration.

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
  _optimistic_ cookie-presence redirects (per Next.js's recommended
  pattern) plus applies security headers (CSP, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`) to every response. It never
  talks to the database.
- **Authoritative auth/authorization checks** always happen server-side in
  Server Components / Route Handlers (`getCurrentSession()`,
  `requireChallengeAccess()`), which is the only place allowed to query
  the database.

## Authentication & session security

- **Registration/login**: Argon2id password hashing (`@noble/hashes`,
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

- **Browser CSP**: middleware generates a fresh nonce for every request.
  Next.js receives that nonce for its hydration/bootstrap scripts, while
  player-controlled content remains unable to add executable script to any
  normal application page.

## The 30 challenges

### 1. IDOR — Confidential Records

Each player's world contains a few "public" HR directory records plus one
confidential record that requires manager clearance. The API correctly
scopes every query to the caller's own world (`owner_id = current user`),
**but never checks the clearance flag** — so a player who simply
edits the `recordIndex` query parameter in the browser URL can view the
confidential record in their own world. This is intentionally a URL-only IDOR
exercise: there is no arbitrary-ID submission form. It models a real BOLA bug:
correct tenant isolation, missing object-level authorization.

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

### 4–15. Contained advanced labs

| Level | Lab                               | Difficulty | Contained mechanic                                                                   |
| ----- | --------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| 4     | Cross-Site Request Forgery        | Medium     | A deliberately state-changing GET modifies only a fictional per-player setting.      |
| 5     | API IDOR                          | Medium     | Sequential synthetic invoice IDs model missing object authorization.                 |
| 6     | Server-Side Request Forgery       | Hard       | URLs are resolved against an in-memory host map; no network call occurs.             |
| 7     | Local / Remote File Inclusion     | Hard       | Paths are resolved against an in-memory virtual filesystem.                          |
| 8     | Command Injection                 | Hard       | A narrow parser simulates separators and virtual command output; no process starts.  |
| 9     | XML External Entity Injection     | Hard       | XXE syntax is recognized directly; no XML parser or external entity is enabled.      |
| 10    | Server-Side Template Injection    | Hard       | Only documented training expressions are interpreted.                                |
| 11    | Cryptographic Failure             | Hard       | A unique per-player flag is protected by intentionally weak repeating-key XOR.       |
| 12    | Security Misconfiguration         | Hard       | A fixed virtual public-file map includes a fictional backup file.                    |
| 13    | Authentication Failure            | Hard       | Predictable sessions exist only in a fictional portal, never in real authentication. |
| 14    | Software Supply Chain Failure     | Very Hard  | Players inspect a static synthetic lockfile; no package is downloaded or executed.   |
| 15    | Exceptional Condition Mishandling | Very Hard  | A synthetic error leaks only the player's generated diagnostic flag.                 |

### 16–30. Contained protocol and state labs

Levels 16–30 use typed, deterministic simulators and per-player database
state. Open redirects and CORS headers are displayed virtually, tokens and
OAuth codes are fictional, NoSQL/GraphQL/deserialization inputs are parsed by
narrow recognizers, request smuggling and WebSocket traffic are byte/protocol
simulations without sockets, and race/cache/capstone state is bounded to the
current player. These labs never perform arbitrary network, filesystem, shell,
XML/template/package execution, email delivery, or real authentication.

| Level | Lab                          | Difficulty | Contained mechanic                                                                 |
| ----- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| 16    | Mass Assignment              | Hard       | A fixed JSON profile model accepts a fictional role field.                         |
| 17    | Open Redirect                | Hard       | The destination is printed; no redirect response or navigation occurs.             |
| 18    | CORS Misconfiguration        | Hard       | Fictional response headers are displayed as text, never applied.                   |
| 19    | JWT Algorithm Confusion      | Very Hard  | A documented lab-only token format cannot authenticate to the app.                 |
| 20    | NoSQL Injection              | Very Hard  | A narrow JSON recognizer runs without a document database.                         |
| 21    | GraphQL Authorization        | Very Hard  | A fixed query recognizer exposes only synthetic employee data.                     |
| 22    | Coupon Race Condition        | Very Hard  | A deterministic scheduler is capped at two virtual attempts per player.            |
| 23    | Prototype Pollution          | Very Hard  | `__proto__` remains inert parsed data; no prototype is mutated.                    |
| 24    | Unsafe Deserialization       | Very Hard  | Fixed type/action strings are interpreted without class construction or execution. |
| 25    | Request Smuggling            | Very Hard  | Two bounded text parsers disagree without opening a socket.                        |
| 26    | Cache Poisoning              | Very Hard  | The virtual cache and poisoned host are private per-player state.                  |
| 27    | Host Header Injection        | Very Hard  | A reset message is previewed; no email or token is created.                        |
| 28    | OAuth State/Redirect Failure | Very Hard  | The code, state, and redirect are fictional; no provider is contacted.             |
| 29    | WebSocket Authorization      | Very Hard  | At most two protocol lines are parsed; no WebSocket is opened.                     |
| 30    | Multi-step Capstone          | Very Hard  | Three ordered commands combine only bounded, per-player simulator state.           |

## How the challenges are contained

**IDOR** is contained by construction: every query is scoped to
`owner_id = <the calling player's own id>`. The bug (missing clearance
check) can only ever expose data _within that same player's own
generated world_ — it is structurally impossible for it to reach another
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
- **Row-Level Security** (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`) uses a
  256-bit per-request context token, one-time-bound to the connection's
  backend PID. Only `app_role` can map that token to a player; `sqli_role`
  can neither read nor rebind the mapping, and mappings expire after five
  minutes so a crashed request cannot leave reusable state. This scopes
  every row — including anything an injected `UNION`/subquery adds — to the
  requesting player, even if injected SQL calls `set_config()`.
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

**Levels 4–15** are additionally isolated by a virtual-target boundary. Their
responses are produced from fixed parsers and per-player rows in
`contained_challenge_state`. They do not forward URLs, resolve hostnames, open
files, spawn processes, parse XML, evaluate JavaScript/templates, alter the
real authentication flow, or install dependencies. The only intentionally
CSRF-vulnerable endpoint changes challenge progress and a fictional setting;
all normal application mutations retain session-bound CSRF checks.

**Levels 16–30** use the same virtual-target boundary plus
`advanced_challenge_state`, keyed by player and challenge. Inputs go only to
fixed-format parsers with bounded state transitions. There are no outbound
requests, sockets, real redirects/CORS headers, token verification, NoSQL or
GraphQL engines, prototype writes, object deserialization, email delivery, or
OAuth/WebSocket connections.

## Dashboard, hints, and reset

- `/dashboard` shows all 30 challenges with a **Locked / Unlocked /
  Completed** badge, driven entirely by server-side state.
- While the trial or subscription is active, each unlocked challenge has a
  collapsible **Hints** section (progressive, non-spoiling nudges). After the
  trial, titles and summaries remain visible but hints and challenge access do
  not.
- **Reset progress** regenerates a brand-new IDOR world, SQLi flags, and
  contained/advanced-lab flags and state,
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
  one-time-use enforcement,
- contained simulator behavior, per-player secrets, and progression through
  the expanded curriculum.

The integration suite validates the same numbered migration files against
PGlite. A real `docker compose up --build` smoke test is still recommended
after changes to the container or database bootstrap configuration.

## Scripts

| Script                            | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Start the Next.js dev server.                            |
| `npm run build`                   | Production build.                                        |
| `npm run build:cloudflare`        | Build the OpenNext Worker and assets.                    |
| `npm run deploy`                 | Deploy the existing OpenNext build to Cloudflare.        |
| `npm run preview`                | Run the existing OpenNext build locally in Workers.      |
| `npm start`                       | Run a production build.                                  |
| `npm run lint`                    | ESLint.                                                  |
| `npm run typecheck`               | TypeScript, no emit.                                     |
| `npm test` / `npm run test:watch` | Vitest.                                                  |
| `npm run migrate`                 | Apply pending SQL migrations (superuser).                |
| `npm run seed:roles`              | Create `app_role`/`sqli_role` outside Docker.            |
| `npm run stripe:webhook`          | Forward Stripe CLI events to the local webhook endpoint. |
| `npm run format`                  | Prettier, write mode.                                    |

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
