import { Buffer } from "node:buffer";
import { getAppPool } from "@/lib/db/pool";
import { generateFlag } from "@/lib/challenges/flag";
import { completeChallenge } from "@/lib/challenges/progress";
import type { QueryableClient } from "@/lib/challenges/progress";
import type { ChallengeKey } from "@/lib/challenges/registry";

export const CONTAINED_CHALLENGE_KEYS = [
  "csrf",
  "api-idor",
  "ssrf",
  "file-inclusion",
  "command-injection",
  "xxe",
  "template-injection",
  "crypto-failure",
  "security-misconfiguration",
  "auth-failure",
  "supply-chain",
  "exception-handling",
] as const satisfies readonly ChallengeKey[];

export type ContainedChallengeKey = (typeof CONTAINED_CHALLENGE_KEYS)[number];

export interface ContainedLabView {
  instructions: string;
  evidence: string;
  inputLabel: string;
  placeholder: string;
}

export interface ContainedLabResult {
  output: string;
  completed: boolean;
  justCompleted: boolean;
}

export function isContainedChallengeKey(
  key: string,
): key is ContainedChallengeKey {
  return (CONTAINED_CHALLENGE_KEYS as readonly string[]).includes(key);
}

export async function seedContainedLabs(
  userId: string,
  client: QueryableClient = getAppPool(),
): Promise<void> {
  await client.query("DELETE FROM contained_challenge_state WHERE user_id = $1", [
    userId,
  ]);
  const values: unknown[] = [];
  const rows = CONTAINED_CHALLENGE_KEYS.map((key, index) => {
    const offset = index * 3;
    values.push(userId, key, generateFlag(key.toUpperCase()));
    return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
  });
  await client.query(
    `INSERT INTO contained_challenge_state (user_id, challenge_key, secret_flag)
     VALUES ${rows.join(", ")}`,
    values,
  );
}

async function getFlag(
  userId: string,
  key: ContainedChallengeKey,
): Promise<string> {
  const result = await getAppPool().query<{ secret_flag: string }>(
    `SELECT secret_flag FROM contained_challenge_state
     WHERE user_id = $1 AND challenge_key = $2`,
    [userId, key],
  );
  if (!result.rows[0]) {
    const flag = generateFlag(key.toUpperCase());
    await getAppPool().query(
      `INSERT INTO contained_challenge_state (user_id, challenge_key, secret_flag)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, challenge_key) DO NOTHING`,
      [userId, key, flag],
    );
    return getFlag(userId, key);
  }
  return result.rows[0].secret_flag;
}

function xorHex(value: string, key: string): string {
  const encrypted = Buffer.from(value).map(
    (byte, index) => byte ^ key.charCodeAt(index % key.length),
  );
  return Buffer.from(encrypted).toString("hex");
}

export async function getContainedLabView(
  userId: string,
  key: ContainedChallengeKey,
): Promise<ContainedLabView> {
  const flag = await getFlag(userId, key);
  const views: Record<ContainedChallengeKey, ContainedLabView> = {
    csrf: {
      instructions:
        "The legacy action below changes notification settings using an authenticated GET request. Construct or visit the action that disables alerts.",
      evidence:
        "Legacy route: GET /api/challenges/labs/csrf?action=<action>. Current setting: alerts-enabled.",
      inputLabel: "No submission form is needed",
      placeholder: "Use the legacy GET endpoint",
    },
    "api-idor": {
      instructions:
        "Request an invoice by numeric identifier. The API should check ownership, but this simulator only checks whether the object exists.",
      evidence:
        'Your invoice: {"id":4101,"customer":"you","total":"$18.00"}. The next identifier may belong to Finance.',
      inputLabel: "Invoice ID",
      placeholder: "4101",
    },
    ssrf: {
      instructions:
        "Submit a URL to the preview service. It uses a closed virtual network map and performs no real DNS lookup or network request.",
      evidence:
        "Public preview example: https://news.lab/article/1. Internal service hint: metadata.lab.",
      inputLabel: "URL to preview",
      placeholder: "https://news.lab/article/1",
    },
    "file-inclusion": {
      instructions:
        "Choose a theme file. The simulator naively resolves paths against /srv/app/themes and reads only from an in-memory virtual filesystem.",
      evidence:
        "Loaded by default: /srv/app/themes/default.txt. A diagnostic secret exists at /srv/etc/lab-secret.",
      inputLabel: "Theme path",
      placeholder: "default.txt",
    },
    "command-injection": {
      instructions:
        "Enter a host for the fictional command `ping -c 1 <host>`. A tiny parser simulates command separators and a single virtual `cat` command.",
      evidence:
        "Virtual diagnostic file: /opt/lab/flag. No process or shell is started.",
      inputLabel: "Host",
      placeholder: "localhost",
    },
    xxe: {
      instructions:
        "Import an XML document. The simulator recognizes a deliberately unsafe external-entity pattern but never invokes an XML parser or reads a file.",
      evidence:
        "The fictional parser can resolve file:///opt/lab/flag.",
      inputLabel: "XML document",
      placeholder: '<?xml version="1.0"?><report>hello</report>',
    },
    "template-injection": {
      instructions:
        "Render a receipt title using a deliberately unsafe, simulated template evaluator.",
      evidence:
        'Template context keys: customer.name, order.total, config.FLAG. Example: {{customer.name}}',
      inputLabel: "Template",
      placeholder: "Receipt for {{customer.name}}",
    },
    "crypto-failure": {
      instructions:
        "Recover the plaintext token and submit it. It was XORed with a repeating three-byte key and hex encoded.",
      evidence: `Algorithm: repeating-key XOR. Key: LAB. Ciphertext: ${xorHex(flag, "LAB")}`,
      inputLabel: "Recovered plaintext",
      placeholder: "FLAG-...",
    },
    "security-misconfiguration": {
      instructions:
        "Request a path from the synthetic public deployment. Only a fixed in-memory file map is used.",
      evidence:
        "Visible files: /index.html, /assets/app.css. The deploy script copied dotfiles and backups.",
      inputLabel: "Public path",
      placeholder: "/index.html",
    },
    "auth-failure": {
      instructions:
        "Submit a session identifier to the fictional admin portal. The lab uses predictable identifiers; the real application sessions remain random and hashed.",
      evidence:
        "Observed low-privilege identifier: guest-session. Privileged role name: admin.",
      inputLabel: "Fictional session ID",
      placeholder: "guest-session",
    },
    "supply-chain": {
      instructions:
        "Identify the suspicious dependency name from this synthetic lockfile excerpt.",
      evidence:
        'ui-kit@4.2.0 -> https://registry.npmjs.org/ui-kit.tgz\ntelemetry-helper@1.1.0 -> git+https://packages.attacker.invalid/telemetry-helper.git\nzod@3.25.0 -> https://registry.npmjs.org/zod.tgz',
      inputLabel: "Compromised package",
      placeholder: "package-name",
    },
    "exception-handling": {
      instructions:
        "Request a report identifier. Trigger the verbose synthetic error, then submit the diagnostic value it leaks.",
      evidence: "Valid report identifiers are positive integers.",
      inputLabel: "Report ID or leaked diagnostic value",
      placeholder: "42",
    },
  };
  return views[key];
}

export async function runContainedLab(
  userId: string,
  key: Exclude<ContainedChallengeKey, "csrf">,
  input: string,
): Promise<ContainedLabResult> {
  const flag = await getFlag(userId, key);
  const normalized = input.trim();
  let output = "The simulated target accepted the input, but no sensitive data was exposed.";
  let solved = false;

  switch (key) {
    case "api-idor":
      solved = normalized === "4102";
      output = solved
        ? `{"id":4102,"customer":"Finance","internalNote":"${flag}"}`
        : normalized === "4101"
          ? '{"id":4101,"customer":"you","total":"$18.00"}'
          : '{"error":"invoice not found"}';
      break;
    case "ssrf":
      solved = /^https?:\/\/metadata\.lab\/latest\/flag\/?$/i.test(normalized);
      output = solved
        ? `HTTP/1.1 200 OK\ncontent-type: text/plain\n\n${flag}`
        : "HTTP/1.1 200 OK\nPreview generated from the virtual public site.";
      break;
    case "file-inclusion":
      solved =
        /(?:\.\.[\\/]){2}etc[\\/]lab-secret$/i.test(normalized) ||
        normalized === "/srv/etc/lab-secret";
      output = solved
        ? flag
        : normalized.startsWith("http")
          ? "Remote include blocked by the virtual loader; look for a local path."
          : "Default blue theme loaded.";
      break;
    case "command-injection":
      solved =
        /(?:;|&&|\|)\s*cat\s+\/opt\/lab\/flag(?:\s|$)/i.test(normalized);
      output = solved
        ? `PING localhost: simulated success\n${flag}`
        : `PING ${normalized || "localhost"}: simulated success`;
      break;
    case "xxe": {
      const entity = normalized.match(
        /<!ENTITY\s+([A-Za-z][\w.-]*)\s+SYSTEM\s+["']file:\/\/\/opt\/lab\/flag["']\s*>/i,
      );
      solved = Boolean(
        /<!DOCTYPE/i.test(normalized) &&
          entity &&
          new RegExp(`&${entity[1]};`).test(normalized),
      );
      output = solved
        ? `<report>${flag}</report>`
        : "<report>Import completed without expanded external data.</report>";
      break;
    }
    case "template-injection":
      solved = /\{\{\s*config\.FLAG\s*\}\}/i.test(normalized);
      output = solved
        ? normalized.replace(/\{\{\s*config\.FLAG\s*\}\}/gi, flag)
        : normalized.replace(/\{\{\s*7\s*\*\s*7\s*\}\}/g, "49");
      break;
    case "crypto-failure":
      solved = normalized === flag;
      output = solved ? "Token decrypted and accepted." : "Plaintext token rejected.";
      break;
    case "security-misconfiguration":
      solved = /^\/?\.env(?:\.backup|\.bak)$/i.test(normalized);
      output = solved
        ? `APP_MODE=training\nDIAGNOSTIC_FLAG=${flag}`
        : normalized === "/index.html"
          ? "<h1>Training deployment</h1>"
          : "404 Not Found";
      break;
    case "auth-failure":
      solved = normalized === "admin-session";
      output = solved
        ? `Welcome, administrator. Audit marker: ${flag}`
        : normalized === "guest-session"
          ? "Welcome, guest. Role: viewer."
          : "Invalid fictional session.";
      break;
    case "supply-chain":
      solved = normalized.toLowerCase() === "telemetry-helper";
      output = solved
        ? `Compromised dependency identified. Incident marker: ${flag}`
        : "No known supply-chain anomaly found for that package.";
      break;
    case "exception-handling":
      solved = normalized === flag;
      output = solved
        ? "Diagnostic value accepted. Final challenge complete."
        : /^\d+$/.test(normalized)
          ? `Report ${normalized} generated successfully.`
          : `ReportParseError: invalid integer "${normalized}"\n  at SyntheticReportService.parse (report.ts:17)\n  diagnosticContext=${flag}`;
      break;
  }

  const justCompleted = solved
    ? await completeChallenge(userId, key)
    : false;
  return { output, completed: solved, justCompleted };
}

export async function completeCsrfLab(userId: string): Promise<boolean> {
  return completeChallenge(userId, "csrf");
}
