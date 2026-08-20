-- 0005_xss_challenge.sql
-- Level 3: a stored payload the player controls, rendered only inside a
-- sandboxed, no-same-origin iframe (enforced in application code/headers,
-- not here). Completion is proven via a one-time, expiring "render token" +
-- flag pair that the callback endpoint checks — no cookies or ambient
-- credentials are trusted, since the sandboxed frame has an opaque origin
-- and cannot read/send them anyway.

CREATE TABLE IF NOT EXISTS xss_messages (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xss_render_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS xss_render_tokens_user_idx ON xss_render_tokens(user_id);
CREATE INDEX IF NOT EXISTS xss_render_tokens_expires_idx ON xss_render_tokens(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON xss_messages, xss_render_tokens TO app_role;
REVOKE ALL ON xss_messages, xss_render_tokens FROM sqli_role;
