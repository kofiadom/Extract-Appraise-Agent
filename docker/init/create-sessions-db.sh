#!/bin/bash
# Creates the agno_sessions database for Agno/FastAPI session storage.
# Runs automatically on first postgres container start via /docker-entrypoint-initdb.d/.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE agno_sessions;
  GRANT ALL PRIVILEGES ON DATABASE agno_sessions TO $POSTGRES_USER;
EOSQL

echo "agno_sessions database created."
