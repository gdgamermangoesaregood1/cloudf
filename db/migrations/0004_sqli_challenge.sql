-- 0004_sqli_challenge.sql
-- Level 2: an intentionally injectable search endpoint that is contained by
-- a hard database boundary rather than by application-layer sanitization:
--
--   * The vulnerable table lives in its own schema (sqli_challenge), never
--     the public schema that holds users/sessions.
--   * The endpoint queries through `sqli_role`, a Postgres role that has
--     ONLY SELECT on sqli_challenge.items and no grants anywhere else — so
--     even a fully successful injection (e.g. UNION-based) cannot read
--     public.users, public.sessions, or any other table, because the
--     database itself will refuse ("permission denied"), independent of any
--     application code.
--   * Row-Level Security additionally scopes every row (including anything
--     an injected UNION/subquery pulls in) to the requesting player's own
--     rows, so one player's injection can never read another player's flag.

CREATE SCHEMA IF NOT EXISTS sqli_challenge;

CREATE TABLE IF NOT EXISTS sqli_challenge.items (
  id           serial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL,
  -- The flag is a real column that the *intended* (safe) query never
  -- selects. Only a successful injection (e.g. UNION SELECT ... secret_flag)
  -- reveals it, which is exactly the intended lesson.
  secret_flag  text NOT NULL
);

CREATE INDEX IF NOT EXISTS sqli_items_user_idx ON sqli_challenge.items(user_id);

ALTER TABLE sqli_challenge.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sqli_challenge.items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_owner_isolation ON sqli_challenge.items;
CREATE POLICY items_owner_isolation ON sqli_challenge.items
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- app_role performs seeding/reset writes for arbitrary players and does not
-- (and should not have to) set app.current_user_id — it is a trusted
-- maintenance path, not the exposed/vulnerable one. Without this policy,
-- FORCE ROW LEVEL SECURITY would block even its own INSERT/UPDATE/DELETE
-- statements. Multiple permissive policies are OR'd together, so sqli_role
-- (which only matches the policy above) remains fully scoped to its own
-- rows regardless of this one.
DROP POLICY IF EXISTS items_app_role_full_access ON sqli_challenge.items;
CREATE POLICY items_app_role_full_access ON sqli_challenge.items
  TO app_role
  USING (true)
  WITH CHECK (true);

-- app_role may seed/reset challenge data but can never read the flag
-- column back out through its own (non-vulnerable) connection. It needs
-- column-level SELECT on user_id only, because DELETE/UPDATE ... WHERE
-- user_id = $1 requires SELECT privilege on any column referenced in the
-- WHERE clause — this does NOT expose title/description/secret_flag.
GRANT USAGE ON SCHEMA sqli_challenge TO app_role;
GRANT INSERT, UPDATE, DELETE ON sqli_challenge.items TO app_role;
GRANT SELECT (user_id) ON sqli_challenge.items TO app_role;
GRANT USAGE, SELECT ON SEQUENCE sqli_challenge.items_id_seq TO app_role;

-- sqli_role: read-only, this table only, nothing in the public schema.
GRANT USAGE ON SCHEMA sqli_challenge TO sqli_role;
GRANT SELECT ON sqli_challenge.items TO sqli_role;
REVOKE ALL ON SCHEMA public FROM sqli_role;
ALTER ROLE sqli_role SET search_path = sqli_challenge, public;

REVOKE ALL ON SCHEMA sqli_challenge FROM PUBLIC;
