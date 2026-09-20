#!/usr/bin/env bash
#
# Regenera supabase/setup.sql a partir de supabase/migrations/.
# El fichero resultante es el que se pega en el SQL Editor de Supabase.
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/setup.sql"

{
  cat <<'HEADER'
-- ===========================================================================
-- Framehouse · instalacion completa en un solo paso
--
-- Pega este fichero entero en el SQL Editor de tu proyecto de Supabase
-- (Dashboard -> SQL Editor -> New query) y pulsa Run. Equivale a aplicar las
-- migraciones de supabase/migrations/ en orden.
--
-- Se puede ejecutar una sola vez sobre un proyecto nuevo y vacio.
-- Generado desde supabase/migrations/ — no editar a mano: si cambias el
-- esquema, regenera con  npm run db:bundle
-- ===========================================================================

HEADER

  for migration in "$ROOT"/supabase/migrations/*.sql; do
    printf '\n-- %s\n-- %s\n-- %s\n\n' \
      "---------------------------------------------------------------------------" \
      "$(basename "$migration")" \
      "---------------------------------------------------------------------------"
    cat "$migration"
  done
} > "$OUT"

echo "Generado $OUT ($(wc -l < "$OUT") lineas)"
