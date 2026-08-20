export function getCsrfTokenFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Thin fetch wrapper for client components: always sends the CSRF header
 * (read from the readable csrf_token cookie) for state-changing requests,
 * and always includes credentials so the HttpOnly session cookie is sent.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", getCsrfTokenFromCookie());
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
