-- Permanent, account-scoped promotional premium entitlements.
CREATE TABLE IF NOT EXISTS promotion_grants (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  promotion_identifier  text NOT NULL,
  granted_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_identifier_normalized CHECK (
    promotion_identifier = lower(btrim(promotion_identifier))
    AND char_length(promotion_identifier) BETWEEN 1 AND 64
  )
);

GRANT SELECT, INSERT ON promotion_grants TO app_role;
REVOKE ALL ON promotion_grants FROM sqli_role;
