import { getAppPool } from "@/lib/db/pool";
import { generateFlag } from "@/lib/challenges/flag";
import { completeChallenge } from "@/lib/challenges/progress";
import type { QueryableClient } from "@/lib/challenges/progress";

export interface IdorRecord {
  recordIndex: number;
  title: string;
  body: string;
  requiresClearance: boolean;
}

const FIRST_NAMES = [
  "Jordan",
  "Casey",
  "Priya",
  "Sam",
  "Morgan",
  "Alex",
  "Riley",
  "Taylor",
];
const DEPARTMENTS = [
  "Logistics",
  "Finance",
  "Facilities",
  "IT Support",
  "Marketing",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a self-contained fictional "world" of HR-style records for one
 * player. All records are scoped to `owner_id = userId`, so no amount of ID
 * guessing can ever reach another player's world — the intentional flaw
 * (missing clearance check) is confined entirely within this one world.
 */
export async function generateIdorWorld(
  userId: string,
  client: QueryableClient = getAppPool(),
): Promise<void> {
  await client.query("DELETE FROM idor_records WHERE owner_id = $1", [userId]);

  const employeeCount = 3;
  for (let i = 1; i <= employeeCount; i += 1) {
    const name = pick(FIRST_NAMES);
    const dept = pick(DEPARTMENTS);
    await client.query(
      `INSERT INTO idor_records (owner_id, record_index, title, body, requires_clearance, is_flag_record)
       VALUES ($1, $2, $3, $4, false, false)`,
      [
        userId,
        i,
        `Employee Directory Entry #${i}`,
        `${name} — ${dept} Department. Desk phone extension ${1000 + i * 17}. Nothing confidential here.`,
      ],
    );
  }

  const flag = generateFlag("IDOR");
  await client.query(
    `INSERT INTO idor_records (owner_id, record_index, title, body, requires_clearance, is_flag_record)
     VALUES ($1, $2, $3, $4, true, true)`,
    [
      userId,
      employeeCount + 1,
      "Executive Compensation Review (Confidential)",
      `RESTRICTED — Manager clearance required. You should not be able to open this record without proper authorization.\n\nCongratulations, you found it anyway: ${flag}`,
    ],
  );
}

export async function listPublicRecords(userId: string): Promise<IdorRecord[]> {
  const result = await getAppPool().query<{
    record_index: number;
    title: string;
    body: string;
    requires_clearance: boolean;
  }>(
    `SELECT record_index, title, body, requires_clearance FROM idor_records
     WHERE owner_id = $1 AND requires_clearance = false
     ORDER BY record_index`,
    [userId],
  );
  return result.rows.map((r) => ({
    recordIndex: r.record_index,
    title: r.title,
    body: r.body,
    requiresClearance: r.requires_clearance,
  }));
}

export interface IdorFetchResult {
  found: boolean;
  record?: IdorRecord;
  justCompleted?: boolean;
}

/**
 * The intentionally vulnerable read path: it correctly scopes the query to
 * the caller's own world (`owner_id = userId`) but — this is the bug being
 * taught — never checks `requires_clearance` against the caller's role, so
 * any record_index within the player's own world is readable.
 */
export async function fetchRecordForPlayer(
  userId: string,
  recordIndex: number,
): Promise<IdorFetchResult> {
  const result = await getAppPool().query<{
    record_index: number;
    title: string;
    body: string;
    requires_clearance: boolean;
    is_flag_record: boolean;
  }>(
    `SELECT record_index, title, body, requires_clearance, is_flag_record
     FROM idor_records
     WHERE owner_id = $1 AND record_index = $2`,
    [userId, recordIndex],
  );
  const row = result.rows[0];
  if (!row) return { found: false };

  let justCompleted = false;
  if (row.is_flag_record) {
    justCompleted = await completeChallenge(userId, "idor");
  }

  return {
    found: true,
    justCompleted,
    record: {
      recordIndex: row.record_index,
      title: row.title,
      body: row.body,
      requiresClearance: row.requires_clearance,
    },
  };
}
