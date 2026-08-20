import { randomBytes } from "node:crypto";

/** Generates a per-player, per-challenge flag value. Never logged or exposed except to the owning player once they legitimately reach it. */
export function generateFlag(prefix: string): string {
  return `FLAG-${prefix}-${randomBytes(8).toString("hex")}`;
}
