-- 0003_idor_challenge.sql
-- Level 1: fictional per-player "world" of HR-style records. Every record is
-- scoped by owner_id (its player's own generated world) so the vulnerability
-- can never leak another player's data — the intentional flaw is that the
-- API forgets to also check the `requires_clearance` flag, so a player who
-- merely knows/guesses another record_index *within their own world* can
-- view a record they should not have access to (a classic BOLA/IDOR:
-- correct tenant isolation, missing object-level authorization).

CREATE TABLE IF NOT EXISTS idor_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_index        integer NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  requires_clearance  boolean NOT NULL DEFAULT false,
  is_flag_record      boolean NOT NULL DEFAULT false,
  UNIQUE (owner_id, record_index)
);

CREATE INDEX IF NOT EXISTS idor_records_owner_idx ON idor_records(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON idor_records TO app_role;
REVOKE ALL ON idor_records FROM sqli_role;
