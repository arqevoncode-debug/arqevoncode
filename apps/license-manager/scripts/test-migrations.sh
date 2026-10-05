#!/usr/bin/env bash
# Aplica todas as migrações num banco descartável e roda os testes SQL de supabase/tests.
# Usa as variáveis padrão do psql (PGHOST, PGPORT, PGUSER, PGPASSWORD). O usuário precisa poder
# criar bancos e papéis. Nunca aponte para o Supabase de produção: o script apaga o banco de teste.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-arqevon_migracoes_teste}"
psql -v ON_ERROR_STOP=1 -q -X -d postgres -c "drop database if exists $DB" -c "create database $DB"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
run() { psql -v ON_ERROR_STOP=1 -q -X -d "$DB" "$@"; }
run -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do run -f "$f"; done
# Reaplicar tudo não pode falhar: as migrações precisam ser idempotentes.
for f in supabase/migrations/*.sql; do run -f "$f"; done
for t in supabase/tests/*.test.sql; do run -o /dev/null -f "$t"; done
psql -q -d postgres -c "drop database $DB"
