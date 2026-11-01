import { getValidRenderToken, getMessage } from "@/lib/challenges/xss";
import { buildXssFrameCsp } from "@/lib/security/headers";
import { getEntitlement } from "@/lib/billing/entitlements";
import { getEnv } from "@/lib/env";

function escapeForScriptContext(value: string): string {
  // Only used for the trusted, server-generated token/flag values embedded
  // in a <script> tag — NOT applied to the player's guestbook content,
  // which is rendered unescaped on purpose (that is the challenge).
  return value.replace(/</g, "\\u003C").replace(/>/g, "\\u003E");
}

function renderErrorPage(message: string, appOrigin: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;color:#b91c1c;padding:2rem;">${message}</body></html>`;
  return new Response(html, {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildXssFrameCsp(appOrigin),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Renders the stored guestbook message in a fully isolated document meant
 * to be embedded via <iframe sandbox="allow-scripts"> (no allow-same-origin,
 * no allow-forms, no allow-popups) from the main app. Combined with the CSP
 * below, that gives this document:
 *   - an opaque ("null") origin: no cookies, no localStorage, no access to
 *     the parent page/DOM,
 *   - default-src 'none' / app-origin connect-src: any script it runs can only
 *     ever reach back to THIS origin's own callback endpoint, never a
 *     third-party exfiltration server,
 * The player's raw, unsanitized content is rendered inside on purpose —
 * that is the entire point of the stored-XSS challenge.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = new URL(getEnv().APP_URL).origin;
  const rt = url.searchParams.get("rt");
  if (!rt) return renderErrorPage("Missing render token.", appOrigin);

  const record = await getValidRenderToken(rt);
  if (!record) {
    return renderErrorPage(
      "This preview link is invalid or has expired. Go back to the challenge page to get a fresh one.",
      appOrigin,
    );
  }
  if (!(await getEntitlement(record.userId)).active) {
    return renderErrorPage(
      "An active trial or subscription is required.",
      appOrigin,
    );
  }

  const content = await getMessage(record.userId);
  const safeToken = escapeForScriptContext(record.token);
  const safeFlag = escapeForScriptContext(record.flag);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Sandboxed guestbook preview</title>
</head>
<body>
<script>
  // Trusted values injected by the server for this one-time render. A
  // successful stored-XSS payload can read these and report them back via
  // fetch('/api/challenges/xss/callback?...') to prove code execution.
  window.__CHALLENGE_FLAG__ = "${safeFlag}";
  window.__RENDER_TOKEN__ = "${safeToken}";
</script>
<div id="guestbook-content">${content}</div>
<hr />
<p style="font-family:system-ui,sans-serif;font-size:12px;color:#6b7280;">
  Sandboxed preview: no cookies, no access to the parent page, no third-party
  network access (Content-Security-Policy: default-src 'none').
</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildXssFrameCsp(appOrigin),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
