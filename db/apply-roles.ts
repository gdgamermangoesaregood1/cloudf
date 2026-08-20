/**
 * Idempotently creates the two least-privilege Postgres roles used by the
 * app. In the docker-compose flow this is handled automatically by
 * `db/init/001_create_roles.sh` (Postgres' docker-entrypoint-initdb.d), but
 * this script lets you run the same bootstrap step against any Postgres
 * server (e.g. a locally-installed one, or an ephemeral test database)
 * without Docker.
 *
 * Usage: npm run seed:roles
 */
import { Client } from "pg";
import "dotenv/config";

export interface RoleClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export async function applyRoles(
  client: RoleClient,
  opts: {
    appUser: string;
    appPassword: string;
    sqliUser: string;
    sqliPassword: string;
  },
): Promise<void> {
  const { appUser, appPassword, sqliUser, sqliPassword } = opts;

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appUser}') THEN
        CREATE ROLE ${appUser} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${sqliUser}') THEN
        CREATE ROLE ${sqliUser} LOGIN PASSWORD '${sqliPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);
}

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "security_training",
    user: process.env.POSTGRES_SUPERUSER ?? "postgres",
    password: process.env.POSTGRES_SUPERUSER_PASSWORD,
  });
  await client.connect();
  try {
    await applyRoles(client, {
      appUser: process.env.APP_DB_USER ?? "app_role",
      appPassword: process.env.APP_DB_PASSWORD ?? "",
      sqliUser: process.env.SQLI_DB_USER ?? "sqli_role",
      sqliPassword: process.env.SQLI_DB_PASSWORD ?? "",
    });
    console.log("Roles ensured: app_role, sqli_role");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
