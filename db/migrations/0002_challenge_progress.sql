-- 0002_challenge_progress.sql
-- Sequential per-player progress across the three challenges.

CREATE TABLE IF NOT EXISTS challenge_progress (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_key text NOT NULL CHECK (challenge_key IN ('idor', 'sqli', 'xss')),
  sort_order    smallint NOT NULL,
  unlocked      boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  PRIMARY KEY (user_id, challenge_key)
);

CREATE INDEX IF NOT EXISTS challenge_progress_user_idx ON challenge_progress(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_progress TO app_role;
REVOKE ALL ON challenge_progress FROM sqli_role;
