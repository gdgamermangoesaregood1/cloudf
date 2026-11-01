-- 0007_levels_16_30.sql
-- Extend sequential progress and create isolated state for contained levels 16-30.

ALTER TABLE challenge_progress
  DROP CONSTRAINT IF EXISTS challenge_progress_challenge_key_check;

ALTER TABLE challenge_progress
  ADD CONSTRAINT challenge_progress_challenge_key_check CHECK (
    challenge_key IN (
      'idor', 'sqli', 'xss', 'csrf', 'api-idor', 'ssrf',
      'file-inclusion', 'command-injection', 'xxe', 'template-injection',
      'crypto-failure', 'security-misconfiguration', 'auth-failure',
      'supply-chain', 'exception-handling', 'mass-assignment',
      'open-redirect', 'cors-misconfiguration', 'jwt-confusion',
      'nosql-injection', 'graphql-authorization', 'coupon-race',
      'prototype-pollution', 'deserialization', 'request-smuggling',
      'cache-poisoning', 'host-header-injection', 'oauth-failure',
      'websocket-authorization', 'capstone'
    )
  );

CREATE TABLE IF NOT EXISTS advanced_challenge_state (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_key text NOT NULL,
  secret_flag   text NOT NULL,
  state         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_key),
  CONSTRAINT advanced_challenge_key_check CHECK (
    challenge_key IN (
      'mass-assignment', 'open-redirect', 'cors-misconfiguration',
      'jwt-confusion', 'nosql-injection', 'graphql-authorization',
      'coupon-race', 'prototype-pollution', 'deserialization',
      'request-smuggling', 'cache-poisoning', 'host-header-injection',
      'oauth-failure', 'websocket-authorization', 'capstone'
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON advanced_challenge_state TO app_role;
REVOKE ALL ON advanced_challenge_state FROM sqli_role;

-- Backfill progress without changing existing completion state. Level 16 is
-- unlocked only when the former final level was already completed.
INSERT INTO challenge_progress (
  user_id, challenge_key, sort_order, unlocked, completed_at
)
SELECT
  users.id,
  levels.challenge_key,
  levels.sort_order,
  levels.sort_order = 16 AND EXISTS (
    SELECT 1
    FROM challenge_progress existing
    WHERE existing.user_id = users.id
      AND existing.challenge_key = 'exception-handling'
      AND existing.completed_at IS NOT NULL
  ),
  NULL
FROM users
CROSS JOIN (
  VALUES
    ('mass-assignment', 16), ('open-redirect', 17),
    ('cors-misconfiguration', 18), ('jwt-confusion', 19),
    ('nosql-injection', 20), ('graphql-authorization', 21),
    ('coupon-race', 22), ('prototype-pollution', 23),
    ('deserialization', 24), ('request-smuggling', 25),
    ('cache-poisoning', 26), ('host-header-injection', 27),
    ('oauth-failure', 28), ('websocket-authorization', 29),
    ('capstone', 30)
) AS levels(challenge_key, sort_order)
ON CONFLICT (user_id, challenge_key) DO NOTHING;

INSERT INTO advanced_challenge_state (
  user_id, challenge_key, secret_flag, state
)
SELECT
  users.id,
  levels.challenge_key,
  'FLAG-' || upper(levels.challenge_key) || '-' ||
    substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16),
  CASE
    WHEN levels.challenge_key = 'coupon-race' THEN '{"redemptions":0}'::jsonb
    WHEN levels.challenge_key = 'cache-poisoning' THEN '{"cachedHost":null}'::jsonb
    WHEN levels.challenge_key = 'capstone' THEN '{"stage":0}'::jsonb
    ELSE '{}'::jsonb
  END
FROM users
CROSS JOIN (
  VALUES
    ('mass-assignment'), ('open-redirect'), ('cors-misconfiguration'),
    ('jwt-confusion'), ('nosql-injection'), ('graphql-authorization'),
    ('coupon-race'), ('prototype-pollution'), ('deserialization'),
    ('request-smuggling'), ('cache-poisoning'), ('host-header-injection'),
    ('oauth-failure'), ('websocket-authorization'), ('capstone')
) AS levels(challenge_key)
ON CONFLICT (user_id, challenge_key) DO NOTHING;
