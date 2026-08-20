-- 0001_core.sql
-- Core application schema: players (users) and opaque hashed sessions.
-- Runs with the Postgres owner/superuser connection (see db/migrate.ts).
-- gen_random_uuid() is built into PostgreSQL 13+, no extension required.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_-]{3,32}$')
);

-- Opaque, hashed, server-side sessions. The raw session token is only ever
-- held by the browser (HttpOnly cookie); the database stores a SHA-256 hash
-- of it, so a database leak alone cannot be used to hijack a live session.
CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  csrf_secret  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Least-privilege grants for the application role. app_role owns no schema
-- objects itself (the migration owner does), it only gets the minimum verbs
-- it needs on these two tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions TO app_role;

-- sqli_role must NEVER be able to read credentials or session tokens, even
-- through an injected UNION query — it simply has no grant here at all.
REVOKE ALL ON users, sessions FROM sqli_role;
