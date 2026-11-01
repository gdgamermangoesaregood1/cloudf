import { getAppPool } from "@/lib/db/pool";
import { generateFlag } from "@/lib/challenges/flag";
import { completeChallenge } from "@/lib/challenges/progress";
import type { QueryableClient } from "@/lib/challenges/progress";
import type { ChallengeKey } from "@/lib/challenges/registry";
import type {
  ContainedLabResult,
  ContainedLabView,
} from "@/lib/challenges/contained-labs";

export const ADVANCED_CHALLENGE_KEYS = [
  "mass-assignment",
  "open-redirect",
  "cors-misconfiguration",
  "jwt-confusion",
  "nosql-injection",
  "graphql-authorization",
  "coupon-race",
  "prototype-pollution",
  "deserialization",
  "request-smuggling",
  "cache-poisoning",
  "host-header-injection",
  "oauth-failure",
  "websocket-authorization",
  "capstone",
] as const satisfies readonly ChallengeKey[];

export type AdvancedChallengeKey = (typeof ADVANCED_CHALLENGE_KEYS)[number];

interface AdvancedStateRow {
  secret_flag: string;
  state: Record<string, unknown>;
}

export function isAdvancedChallengeKey(
  key: string,
): key is AdvancedChallengeKey {
  return (ADVANCED_CHALLENGE_KEYS as readonly string[]).includes(key);
}

function initialState(key: AdvancedChallengeKey): Record<string, unknown> {
  if (key === "coupon-race") return { redemptions: 0 };
  if (key === "cache-poisoning") return { cachedHost: null };
  if (key === "capstone") return { stage: 0 };
  return {};
}

export async function seedAdvancedLabs(
  userId: string,
  client: QueryableClient = getAppPool(),
): Promise<void> {
  await client.query("DELETE FROM advanced_challenge_state WHERE user_id = $1", [
    userId,
  ]);
  const values: unknown[] = [];
  const rows = ADVANCED_CHALLENGE_KEYS.map((key, index) => {
    const offset = index * 4;
    values.push(
      userId,
      key,
      generateFlag(key.toUpperCase()),
      JSON.stringify(initialState(key)),
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`;
  });
  await client.query(
    `INSERT INTO advanced_challenge_state
       (user_id, challenge_key, secret_flag, state)
     VALUES ${rows.join(", ")}`,
    values,
  );
}

async function getState(
  userId: string,
  key: AdvancedChallengeKey,
): Promise<AdvancedStateRow> {
  const result = await getAppPool().query<AdvancedStateRow>(
    `SELECT secret_flag, state FROM advanced_challenge_state
     WHERE user_id = $1 AND challenge_key = $2`,
    [userId, key],
  );
  if (result.rows[0]) return result.rows[0];

  await getAppPool().query(
    `INSERT INTO advanced_challenge_state
       (user_id, challenge_key, secret_flag, state)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, challenge_key) DO NOTHING`,
    [userId, key, generateFlag(key.toUpperCase()), JSON.stringify(initialState(key))],
  );
  return getState(userId, key);
}

async function writeState(
  userId: string,
  key: AdvancedChallengeKey,
  state: Record<string, unknown>,
): Promise<void> {
  await getAppPool().query(
    `UPDATE advanced_challenge_state
     SET state = $3::jsonb, updated_at = now()
     WHERE user_id = $1 AND challenge_key = $2`,
    [userId, key, JSON.stringify(state)],
  );
}

async function advanceCapstoneStage(
  userId: string,
  expectedStage: number,
  nextStage: number,
): Promise<boolean> {
  const result = await getAppPool().query(
    `UPDATE advanced_challenge_state
     SET state = jsonb_set(state, '{stage}', to_jsonb($4::integer)),
         updated_at = now()
     WHERE user_id = $1 AND challenge_key = $2
       AND COALESCE((state->>'stage')::integer, 0) = $3
     RETURNING challenge_key`,
    [userId, "capstone", expectedStage, nextStage],
  );
  return (result.rowCount ?? 0) > 0;
}

function parseObject(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isExternalLabUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname === "attacker.invalid"
    );
  } catch {
    return false;
  }
}

export async function getAdvancedLabView(
  userId: string,
  key: AdvancedChallengeKey,
): Promise<ContainedLabView> {
  const { state } = await getState(userId, key);
  const views: Record<AdvancedChallengeKey, ContainedLabView> = {
    "mass-assignment": {
      instructions:
        "Send a fictional profile update as JSON. The vulnerable binder copies both visible and server-managed fields.",
      evidence:
        'Visible request: {"displayName":"analyst"}. Stored fictional role: member.',
      inputLabel: "Profile JSON",
      placeholder: '{"displayName":"analyst","role":"admin"}',
    },
    "open-redirect": {
      instructions:
        "Supply a return URL to the virtual login callback. The simulator prints its decision and never emits a Location header.",
      evidence: "Allowed return example: /dashboard. Fictional external host: attacker.invalid.",
      inputLabel: "Virtual return URL",
      placeholder: "https://attacker.invalid/callback",
    },
    "cors-misconfiguration": {
      instructions:
        "Supply the Origin seen by a fictional credentialed profile API. Its simulated CORS headers are returned only as text.",
      evidence:
        "Synthetic endpoint: api.partner.lab/profile. Credentials mode: include.",
      inputLabel: "Fictional Origin",
      placeholder: "https://attacker.invalid",
    },
    "jwt-confusion": {
      instructions:
        "Forge a lab-only token for the synthetic verifier. This format is not a JWT accepted anywhere else.",
      evidence:
        "Expected alg: RS256. Published verification key: LAB-RSA-PUBLIC. Format: alg=<alg>;role=<role>;key=<key>",
      inputLabel: "Fictional token",
      placeholder: "alg=HS256;role=admin;key=LAB-RSA-PUBLIC",
    },
    "nosql-injection": {
      instructions:
        "Submit a JSON login filter. The simulator recognizes only the documented equality and $ne shapes; it never queries a database.",
      evidence: 'Normal request: {"username":"guest","password":"guest-pass"}',
      inputLabel: "Synthetic document query",
      placeholder: '{"username":{"$ne":null},"password":{"$ne":null}}',
    },
    "graphql-authorization": {
      instructions:
        "Query the narrow fictional employee graph. Only user and selected fields are recognized.",
      evidence:
        'Your query: user(id:"1"){name}. Schema fields: name, department, privateNote.',
      inputLabel: "Graph query",
      placeholder: 'query { user(id:"2") { privateNote } }',
    },
    "coupon-race": {
      instructions:
        "Run the bounded scheduler with exactly two virtual redemptions. It models stale reads without threads, timers, or external calls.",
      evidence: `Coupon LAB20: one use per player. Recorded virtual redemptions: ${Number(state.redemptions) || 0}/2.`,
      inputLabel: "Scheduler command",
      placeholder: "RACE 2",
    },
    "prototype-pollution": {
      instructions:
        "Submit an unsafe merge payload. The simulator reads __proto__ as inert JSON data and never assigns it to any object prototype.",
      evidence: "Fictional defaults: theme=light, isAdmin=false.",
      inputLabel: "Merge JSON",
      placeholder: '{"__proto__":{"isAdmin":true}}',
    },
    deserialization: {
      instructions:
        "Import a synthetic job object. Fixed strings model dangerous type dispatch; no class, function, or command is invoked.",
      evidence: 'Allowed example: {"type":"ReportJob","action":"preview"}',
      inputLabel: "Serialized job JSON",
      placeholder: '{"type":"DiagnosticJob","action":"revealFlag"}',
    },
    "request-smuggling": {
      instructions:
        "Paste virtual HTTP/1 bytes for two fixed parsers. Parsing is bounded to this text and no connection or socket is opened.",
      evidence:
        "Front end prefers Content-Length; back end prefers Transfer-Encoding. Synthetic protected path: /admin/flag.",
      inputLabel: "Virtual request bytes",
      placeholder:
        "POST / HTTP/1.1\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /admin/flag HTTP/1.1",
    },
    "cache-poisoning": {
      instructions:
        "Prime your private virtual cache with an unkeyed host, then submit GET in a second request to observe the poisoned page.",
      evidence: `Cache key: /reset-help. Cached host: ${typeof state.cachedHost === "string" ? state.cachedHost : "(empty)"}.`,
      inputLabel: "Cache command",
      placeholder: "PRIME attacker.invalid",
    },
    "host-header-injection": {
      instructions:
        "Supply a fictional Host value to preview an unsafe password-reset message. Nothing is sent and no real account token is created.",
      evidence: "Configured application origin should be https://accounts.lab.",
      inputLabel: "Fictional Host",
      placeholder: "attacker.invalid",
    },
    "oauth-failure": {
      instructions:
        "Submit simulated callback parameters. No provider is contacted and the code has no meaning outside this parser.",
      evidence:
        "Expected state: bound-state-7. Registered redirect: https://client.lab/callback.",
      inputLabel: "Virtual callback query",
      placeholder:
        "state=missing&redirect_uri=https%3A%2F%2Fattacker.invalid%2Fcallback&code=fictional",
    },
    "websocket-authorization": {
      instructions:
        "Send at most two lines to the protocol simulator. It does not create, upgrade, or connect a WebSocket.",
      evidence: "Public channel: news. Privileged synthetic channel: admin.audit.",
      inputLabel: "Virtual protocol frames",
      placeholder: "AUTH guest\nSUBSCRIBE admin.audit",
    },
    capstone: {
      instructions:
        "Complete three ordered commands across separate submissions. All state and output belong only to your generated world.",
      evidence: `Current capstone stage: ${Number(state.stage) || 0}/3. Commands: ASSIGN role=admin; PRIME attacker.invalid; SUBSCRIBE admin.audit.`,
      inputLabel: "Capstone command",
      placeholder:
        Number(state.stage) === 1
          ? "PRIME attacker.invalid"
          : Number(state.stage) === 2
            ? "SUBSCRIBE admin.audit"
            : "ASSIGN role=admin",
    },
  };
  return views[key];
}

export async function runAdvancedLab(
  userId: string,
  key: AdvancedChallengeKey,
  input: string,
): Promise<ContainedLabResult> {
  const row = await getState(userId, key);
  const flag = row.secret_flag;
  const state = row.state;
  const normalized = input.trim();
  let output = "The virtual target accepted the input, but the flaw was not demonstrated.";
  let solved = false;

  switch (key) {
    case "mass-assignment": {
      const value = parseObject(normalized);
      solved = value?.role === "admin";
      output = solved
        ? `Profile saved. Fictional role=admin. Audit marker: ${flag}`
        : `Profile saved. Fictional role=member.`;
      break;
    }
    case "open-redirect":
      solved = isExternalLabUrl(normalized);
      output = solved
        ? `VIRTUAL REDIRECT ONLY -> ${normalized}\nCallback marker: ${flag}`
        : `VIRTUAL REDIRECT ONLY -> ${normalized.startsWith("/") ? normalized : "/dashboard"}`;
      break;
    case "cors-misconfiguration":
      solved = normalized === "https://attacker.invalid";
      output = solved
        ? `Fictional response (not real headers):\nAccess-Control-Allow-Origin: ${normalized}\nAccess-Control-Allow-Credentials: true\n{"privateNote":"${flag}"}`
        : `Fictional response denied for Origin: ${normalized}`;
      break;
    case "jwt-confusion": {
      const fields = Object.fromEntries(
        normalized.split(";").map((part) => {
          const separator = part.indexOf("=");
          return separator < 0
            ? [part.trim(), ""]
            : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
        }),
      );
      solved =
        fields.alg === "HS256" &&
        fields.role === "admin" &&
        fields.key === "LAB-RSA-PUBLIC";
      output = solved
        ? `Fictional admin token accepted. Claim marker: ${flag}`
        : "Fictional token rejected.";
      break;
    }
    case "nosql-injection": {
      const value = parseObject(normalized);
      const username = value?.username;
      const password = value?.password;
      const isNotEqualOperator = (candidate: unknown) =>
        Boolean(
          candidate &&
            typeof candidate === "object" &&
            !Array.isArray(candidate) &&
            Object.hasOwn(candidate, "$ne"),
        );
      solved = isNotEqualOperator(username) && isNotEqualOperator(password);
      output = solved
        ? `Synthetic document matched admin first. Private note: ${flag}`
        : "No fictional account matched that query.";
      break;
    }
    case "graphql-authorization":
      solved =
        /user\s*\(\s*id\s*:\s*["']2["']\s*\)/i.test(normalized) &&
        /\bprivateNote\b/.test(normalized);
      output = solved
        ? `{"data":{"user":{"privateNote":"${flag}"}}}`
        : '{"data":{"user":{"name":"Synthetic User"}}}';
      break;
    case "coupon-race": {
      const previous = Math.min(2, Math.max(0, Number(state.redemptions) || 0));
      if (/^RACE\s+2$/i.test(normalized)) {
        if (previous === 2) {
          output = "Coupon already exhausted in this private simulator (2/2).";
          break;
        }
        const redemptions = Math.min(2, previous + 2);
        await writeState(userId, key, { redemptions });
        solved = redemptions === 2;
        output = solved
          ? `Virtual request A: accepted\nVirtual request B: accepted from stale snapshot\nRedemptions capped at 2/2. Marker: ${flag}`
          : "The bounded race did not produce a duplicate redemption.";
      } else {
        output =
          "Scheduler refused command. Exactly two virtual attempts are allowed.";
      }
      break;
    }
    case "prototype-pollution": {
      const value = parseObject(normalized);
      const proto = value && Object.hasOwn(value, "__proto__")
        ? value["__proto__"]
        : null;
      solved = Boolean(
        proto &&
          typeof proto === "object" &&
          !Array.isArray(proto) &&
          (proto as Record<string, unknown>).isAdmin === true,
      );
      output = solved
        ? `Virtual merged defaults report isAdmin=true. Marker: ${flag}\nGlobal prototype mutation: false`
        : "Virtual merged defaults report isAdmin=false. Global prototype mutation: false";
      break;
    }
    case "deserialization": {
      const value = parseObject(normalized);
      solved =
        value?.type === "DiagnosticJob" && value?.action === "revealFlag";
      output = solved
        ? `Simulated dispatch result: ${flag}\nExecution performed: false`
        : "Serialized job parsed as inert data. Execution performed: false";
      break;
    }
    case "request-smuggling": {
      const hasCl = /(?:^|\r?\n)Content-Length\s*:\s*\d+/i.test(input);
      const hasTe =
        /(?:^|\r?\n)Transfer-Encoding\s*:\s*chunked/i.test(input);
      const smuggled =
        /0\r?\n\r?\nGET\s+\/admin\/flag\s+HTTP\/1\.[01]/i.test(input);
      solved = hasCl && hasTe && smuggled;
      output = solved
        ? `Front parser: one request\nBack parser: queued GET /admin/flag\nSynthetic response: ${flag}\nSockets opened: 0`
        : "Both bounded parsers finished. No protected virtual request was queued. Sockets opened: 0";
      break;
    }
    case "cache-poisoning": {
      const prime = normalized.match(/^PRIME\s+([a-z0-9.-]+)$/i);
      if (prime) {
        const cachedHost = prime[1]!.toLowerCase();
        await writeState(userId, key, { cachedHost });
        output = `Private virtual cache primed for /reset-help with Host=${cachedHost}. Submit GET to read it.`;
      } else if (/^GET$/i.test(normalized)) {
        solved = state.cachedHost === "attacker.invalid";
        output = solved
          ? `Cached reset page: https://attacker.invalid/claim/${flag}`
          : "Cached reset page: https://accounts.lab/reset-help";
      }
      break;
    }
    case "host-header-injection":
      solved = normalized.toLowerCase() === "attacker.invalid";
      output = solved
        ? `Synthetic outbox preview (nothing sent):\nhttps://attacker.invalid/reset/${flag}\nReal token created: false`
        : "Synthetic outbox preview: https://accounts.lab/reset/example\nReal token created: false";
      break;
    case "oauth-failure": {
      const params = new URLSearchParams(normalized);
      solved =
        params.get("state") !== "bound-state-7" &&
        params.get("redirect_uri") === "https://attacker.invalid/callback" &&
        params.get("code") === "fictional";
      output = solved
        ? `Virtual code delivered to unregistered redirect. Incident marker: ${flag}\nProvider contacted: false`
        : "Virtual callback rejected or safely bound. Provider contacted: false";
      break;
    }
    case "websocket-authorization": {
      const lines = normalized.split(/\r?\n/);
      solved =
        lines.length === 2 &&
        lines[0] === "AUTH guest" &&
        lines[1] === "SUBSCRIBE admin.audit";
      output = solved
        ? `Protocol simulator: subscribed guest to admin.audit\nSynthetic event: ${flag}\nSocket opened: false`
        : "Protocol simulator denied or ignored the frames. Socket opened: false";
      break;
    }
    case "capstone": {
      const stage = Math.min(3, Math.max(0, Number(state.stage) || 0));
      const transition =
        normalized === "ASSIGN role=admin"
          ? { expected: 0, next: 1, output: "Stage 1/3: fictional role bound to admin." }
          : normalized === "PRIME attacker.invalid"
            ? { expected: 1, next: 2, output: "Stage 2/3: private virtual cache primed." }
            : normalized === "SUBSCRIBE admin.audit"
              ? {
                  expected: 2,
                  next: 3,
                  output: `Stage 3/3: unauthorized synthetic audit event exposed.\nCapstone marker: ${flag}`,
                }
              : null;
      if (transition && stage === transition.expected) {
        const advanced = await advanceCapstoneStage(
          userId,
          transition.expected,
          transition.next,
        );
        if (advanced) {
          solved = transition.next === 3;
          output = transition.output;
        } else {
          const latest = await getState(userId, key);
          const latestStage = Number(latest.state.stage) || 0;
          solved = latestStage === 3;
          output = solved
            ? `Capstone already complete. Marker: ${flag}`
            : `Another request advanced the capstone. Continue from stage ${latestStage + 1}.`;
        }
      } else if (stage === 3) {
        solved = true;
        output = `Capstone already complete. Marker: ${flag}`;
      } else {
        output = `Command did not match required stage ${stage + 1}.`;
      }
      break;
    }
  }

  const justCompleted = solved
    ? await completeChallenge(userId, key)
    : false;
  return { output, completed: solved, justCompleted };
}
