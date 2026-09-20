#!/usr/bin/env bash
#
# Levanta un Postgres local efimero, aplica las migraciones y ejecuta la
# bateria de pruebas de RLS. No toca el proyecto de Supabase.
#
# Requiere binarios de PostgreSQL 15+ (initdb, pg_ctl, psql).
#
#   ./scripts/db-test.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
PORT="${PGTEST_PORT:-5439}"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"

cleanup() {
  "$PGBIN/pg_ctl" -D "$WORKDIR/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> Cluster temporal en $WORKDIR"
"$PGBIN/initdb" -D "$WORKDIR/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORKDIR/data" -l "$WORKDIR/pg.log" \
  -o "-p $PORT -k $WORKDIR" start >/dev/null
sleep 1

PSQL=("psql" "-h" "$WORKDIR" "-p" "$PORT" "-U" "postgres" "-v" "ON_ERROR_STOP=1" "-q")

"${PSQL[@]}" -c "create database framehouse;" >/dev/null

echo "==> Aplicando el esqueleto de Supabase y las migraciones"
"${PSQL[@]}" -d framehouse -f "$ROOT/supabase/tests/00_supabase_shim.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$migration")"
  "${PSQL[@]}" -d framehouse -f "$migration" >/dev/null
done

echo "==> Pruebas de politicas y pipeline"
psql -h "$WORKDIR" -p "$PORT" -U postgres -d framehouse \
  -f "$ROOT/supabase/tests/01_policies.sql"
