/**
 * Minimal, dependency-light SQL migration runner.
 *
 * Connects with the Postgres OWNER/SUPERUSER credentials (never the
 * app_role/sqli_role runtime credentials) because applying these migrations
 * requires CREATE SCHEMA/TABLE/POLICY and GRANT/REVOKE privileges that the
 * least-privilege runtime roles intentionally do not have.
 *
 * Usage:
 *   npm run migrate        # apply all pending migrations in order
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: requireEnv("POSTGRES_DB"),
    user: requireEnv("POSTGRES_SUPERUSER"),
    password: requireEnv("POSTGRES_SUPERUSER_PASSWORD"),
    ssl: process.env.POSTGRES_SSL === "require",
  });

  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (
        await client.query<{ filename: string }>(
          "SELECT filename FROM schema_migrations",
        )
      ).rows.map((r) => r.filename),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Applying migration: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        appliedCount += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Migration failed: ${file}`);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log("No pending migrations. Database is up to date.");
    } else {
      console.log(`Applied ${appliedCount} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
