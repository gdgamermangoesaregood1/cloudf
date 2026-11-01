-- 0006_extended_challenges.sql
-- Expand progression and add per-player secrets for contained challenge simulators.

ALTER TABLE challenge_progress
  DROP CONSTRAINT IF EXISTS challenge_progress_challenge_key_check;

ALTER TABLE challenge_progress
  ADD CONSTRAINT challenge_progress_challenge_key_check CHECK (
    challenge_key IN (
      'idor', 'sqli', 'xss', 'csrf', 'api-idor', 'ssrf',
      'file-inclusion', 'command-injection', 'xxe', 'template-injection',
      'crypto-failure', 'security-misconfiguration', 'auth-failure',
      'supply-chain', 'exception-handling'
    )
  );

-- Bind SQLi RLS through a per-request, 256-bit token mapped in a table that
-- the vulnerable sqli_role cannot read or modify. The token lives in a custom
-- GUC and one-time-bound to the connection's immutable backend PID, so a
-- token cannot be replayed from a different connection even if exposed.
CREATE TABLE IF NOT EXISTS sqli_challenge.request_context (
  context_token text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  backend_pid   integer,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);

REVOKE ALL ON sqli_challenge.request_context FROM PUBLIC, sqli_role;
GRANT INSERT, DELETE ON sqli_challenge.request_context TO app_role;
GRANT SELECT (context_token, expires_at) ON sqli_challenge.request_context TO app_role;

CREATE OR REPLACE FUNCTION sqli_challenge.attach_request_context(token text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, sqli_challenge
AS $$
  UPDATE sqli_challenge.request_context
  SET backend_pid = pg_backend_pid()
  WHERE context_token = token
    AND backend_pid IS NULL
    AND expires_at > clock_timestamp()
  RETURNING true
$$;

REVOKE ALL ON FUNCTION sqli_challenge.attach_request_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sqli_challenge.attach_request_context(text) TO sqli_role;

CREATE OR REPLACE FUNCTION sqli_challenge.current_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, sqli_challenge
AS $$
  SELECT user_id
  FROM sqli_challenge.request_context
  WHERE context_token = current_setting('sectrain.context_token', true)
    AND backend_pid = pg_backend_pid()
    AND expires_at > clock_timestamp()
$$;

REVOKE ALL ON FUNCTION sqli_challenge.current_player_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sqli_challenge.current_player_id() TO sqli_role;

DROP POLICY IF EXISTS items_owner_isolation ON sqli_challenge.items;
CREATE POLICY items_owner_isolation ON sqli_challenge.items
  USING (user_id = sqli_challenge.current_player_id());

CREATE TABLE IF NOT EXISTS contained_challenge_state (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_key text NOT NULL,
  secret_flag   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_key),
  CONSTRAINT contained_challenge_key_check CHECK (
    challenge_key IN (
      'csrf', 'api-idor', 'ssrf', 'file-inclusion', 'command-injection',
      'xxe', 'template-injection', 'crypto-failure',
      'security-misconfiguration', 'auth-failure', 'supply-chain',
      'exception-handling'
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON contained_challenge_state TO app_role;
REVOKE ALL ON contained_challenge_state FROM sqli_role;

INSERT INTO challenge_progress (
  user_id, challenge_key, sort_order, unlocked, completed_at
)
SELECT
  users.id,
  levels.challenge_key,
  levels.sort_order,
  levels.challenge_key = 'csrf' AND EXISTS (
    SELECT 1
    FROM challenge_progress existing
    WHERE existing.user_id = users.id
      AND existing.challenge_key = 'xss'
      AND existing.completed_at IS NOT NULL
  ),
  NULL
FROM users
CROSS JOIN (
  VALUES
    ('csrf', 4), ('api-idor', 5), ('ssrf', 6), ('file-inclusion', 7),
    ('command-injection', 8), ('xxe', 9), ('template-injection', 10),
    ('crypto-failure', 11), ('security-misconfiguration', 12),
    ('auth-failure', 13), ('supply-chain', 14), ('exception-handling', 15)
) AS levels(challenge_key, sort_order)
ON CONFLICT (user_id, challenge_key) DO NOTHING;

INSERT INTO contained_challenge_state (user_id, challenge_key, secret_flag)
SELECT
  users.id,
  levels.challenge_key,
  'FLAG-' || upper(levels.challenge_key) || '-' ||
    substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16)
FROM users
CROSS JOIN (
  VALUES
    ('csrf'), ('api-idor'), ('ssrf'), ('file-inclusion'),
    ('command-injection'), ('xxe'), ('template-injection'),
    ('crypto-failure'), ('security-misconfiguration'), ('auth-failure'),
    ('supply-chain'), ('exception-handling')
) AS levels(challenge_key)
ON CONFLICT (user_id, challenge_key) DO NOTHING;
