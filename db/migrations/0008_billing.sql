-- Registration trials, Stripe subscription state, and webhook idempotency.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Existing accounts receive the same trial window from the migration date.
UPDATE users
SET trial_started_at = COALESCE(trial_started_at, now()),
    trial_ends_at = COALESCE(trial_ends_at, now() + interval '15 days')
WHERE trial_started_at IS NULL OR trial_ends_at IS NULL;

ALTER TABLE users
  ALTER COLUMN trial_started_at SET DEFAULT now(),
  ALTER COLUMN trial_started_at SET NOT NULL,
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '15 days'),
  ALTER COLUMN trial_ends_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id  text NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id     text NOT NULL,
  stripe_price_id        text,
  status                 text NOT NULL,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  last_event_created     bigint NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_id_idx
  ON billing_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_id_idx
  ON billing_subscriptions(stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key  text NOT NULL,
  status           text NOT NULL CHECK (status IN ('pending', 'completed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type      text NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON billing_customers, billing_subscriptions, billing_checkout_attempts,
     stripe_webhook_events TO app_role;
GRANT SELECT, UPDATE ON users TO app_role;

REVOKE ALL
  ON billing_customers, billing_subscriptions, billing_checkout_attempts,
     stripe_webhook_events
  FROM sqli_role;
