import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "local";
}
