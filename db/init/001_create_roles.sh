#!/usr/bin/env bash
# Runs automatically on first container start via the official postgres
# image's docker-entrypoint-initdb.d mechanism (superuser context only).
# Creates the two least-privilege application roles. Table/schema-level
# grants for these roles live in db/migrations/*.sql, applied afterwards by
# `npm run migrate` using the Postgres owner/superuser connection.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER must be set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"
: "${SQLI_DB_USER:?SQLI_DB_USER must be set}"
: "${SQLI_DB_PASSWORD:?SQLI_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
      CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${SQLI_DB_USER}') THEN
      CREATE ROLE ${SQLI_DB_USER} LOGIN PASSWORD '${SQLI_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
  END
  \$\$;

  -- New objects are private by default; migrations grant exactly what each
  -- role needs, nothing more.
  ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
EOSQL
