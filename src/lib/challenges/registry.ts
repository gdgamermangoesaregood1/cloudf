export type ChallengeKey = "idor" | "sqli" | "xss";

export interface ChallengeMeta {
  key: ChallengeKey;
  order: number;
  title: string;
  path: string;
  summary: string;
  hints: string[];
}

/** Fixed, sequential challenge order: idor -> sqli -> xss. */
export const CHALLENGES: readonly ChallengeMeta[] = [
  {
    key: "idor",
    order: 1,
    title: "Confidential Records (Broken Object-Level Authorization)",
    path: "/challenges/idor",
    summary:
      "Your generated company world has several HR records. Something you shouldn't be able to open is only one click away.",
    hints: [
      "The record viewer takes a record number from the URL. What happens if you change it?",
      "Not every record is meant for every clearance level — does the app actually check that?",
      "You only ever see your own world's records; try every small integer, not just the ones linked from the page.",
    ],
  },
  {
    key: "sqli",
    order: 2,
    title: "Directory Search (SQL Injection)",
    path: "/challenges/sqli",
    summary:
      "A search box queries a small, isolated challenge database. The visible columns never show a flag — but the query might return more than intended.",
    hints: [
      "The search term is inserted directly into the SQL text, not bound as a parameter.",
      "Try breaking out of the string with a single quote (') and see what error comes back.",
      "A UNION SELECT can add extra columns to the result set, including ones the app never intended to display.",
    ],
  },
  {
    key: "xss",
    order: 3,
    title: "Guestbook (Stored Cross-Site Scripting)",
    path: "/challenges/xss",
    summary:
      "Post a guestbook message. It is rendered back to you, unescaped, inside a sandboxed preview frame. Can you get it to call home?",
    hints: [
      "The preview frame runs your exact HTML/JS — the app does not sanitize it.",
      "The frame has no cookies and no access to the parent page (it's sandboxed), so you need another way to prove code ran.",
      "Look for a global flag value available inside the frame, and send it to /api/challenges/xss/callback yourself.",
    ],
  },
];

export function getChallengeMeta(key: ChallengeKey): ChallengeMeta {
  const meta = CHALLENGES.find((c) => c.key === key);
  if (!meta) throw new Error(`Unknown challenge key: ${key}`);
  return meta;
}

export function nextChallengeKey(key: ChallengeKey): ChallengeKey | undefined {
  const meta = getChallengeMeta(key);
  return CHALLENGES.find((c) => c.order === meta.order + 1)?.key;
}
