import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing with security-appropriate parameters
 * (OWASP-recommended minimums: >= 19 MiB memory, 2 iterations, degree of
 * parallelism 1 is the minimum acceptable baseline — we use stronger
 * settings since this runs on a dev machine, not a constrained device).
 * Argon2id is the library default algorithm, so it is not repeated here to
 * avoid importing the `Algorithm` const enum (incompatible with
 * `isolatedModules`).
 */
const HASH_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return hash(plainTextPassword, HASH_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  candidatePassword: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, candidatePassword, HASH_OPTIONS);
  } catch {
    // Malformed hash or verification error — treat as invalid credentials
    // rather than leaking failure details.
    return false;
  }
}
