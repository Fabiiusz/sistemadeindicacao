#!/usr/bin/env bash
# Sobe um Postgres local descartável, aplica o shim do Supabase + migrations
# + seed e roda os testes de banco (tests/db). Requer binários do Postgres 15+.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl)")}"
DIR="$ROOT/.pgtest"
PORT="${PGTEST_PORT:-54329}"
RUN=()
if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); fi

mkdir -p "$DIR"
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; fi
if [ ! -f "$DIR/data/PG_VERSION" ]; then
  "${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
fi
if ! "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" status >/dev/null 2>&1; then
  "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
fi

export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists portacheia_test" -c "create database portacheia_test"
"${PSQL[@]}" -d portacheia_test -f "$ROOT/supabase/tests/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d portacheia_test -f "$f"
done
if [ "${SEM_SEED:-}" != "1" ] && [ -f "$ROOT/supabase/seed.sql" ]; then
  "${PSQL[@]}" -d portacheia_test -f "$ROOT/supabase/seed.sql"
fi

export TEST_DATABASE_URL="postgresql://postgres@localhost/portacheia_test?host=$DIR&port=$PORT"
cd "$ROOT"
npx vitest run tests/db "$@"
