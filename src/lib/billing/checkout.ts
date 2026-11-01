import { getAppPool } from "@/lib/db/pool";

export async function claimCheckoutAttempt(userId: string): Promise<string> {
  const attempt = await getAppPool().query<{ idempotency_key: string }>(
    `INSERT INTO billing_checkout_attempts
       (user_id, idempotency_key, status)
     VALUES ($1, gen_random_uuid()::text, 'pending')
     ON CONFLICT (user_id) DO UPDATE SET
       idempotency_key = CASE
         WHEN billing_checkout_attempts.status = 'pending'
          AND billing_checkout_attempts.created_at > now() - interval '31 minutes'
         THEN billing_checkout_attempts.idempotency_key
         ELSE gen_random_uuid()::text
       END,
       status = 'pending',
       created_at = CASE
         WHEN billing_checkout_attempts.status = 'pending'
          AND billing_checkout_attempts.created_at > now() - interval '31 minutes'
         THEN billing_checkout_attempts.created_at
         ELSE now()
       END,
       updated_at = now()
     RETURNING idempotency_key`,
    [userId],
  );
  const idempotencyKey = attempt.rows[0]?.idempotency_key;
  if (!idempotencyKey) {
    throw new Error("Could not create a billing checkout attempt.");
  }
  return idempotencyKey;
}
