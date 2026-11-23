#!/usr/bin/env bash
# Query performance check against a THROWAWAY database (never the dev or a real one).
#
#   bash server/perf/run.sh setup    # create clouddrive_perf in the test container + seed
#   bash server/perf/run.sh <label>  # capture the app's SQL, EXPLAIN ANALYZE it → out/<label>.txt
#   bash server/perf/run.sh drop     # remove clouddrive_perf again
#
# How it works: Postgres logs every statement of clouddrive_perf (log_min_duration_statement
# = 0, set on that database only); capture.mjs runs the app's own repository calls for the
# hot pages; explain.mjs reads the log and EXPLAIN ANALYZEs each statement (median of 5).
# Results and method: docs/PERFORMANCE.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"
CONTAINER=clouddrive-db-test
PSQL=(docker exec -i "$CONTAINER" psql -U clouddrive -v ON_ERROR_STOP=1 -q)

case "${1:?usage: run.sh setup|drop|<label>}" in
  setup)
    "${PSQL[@]}" -d clouddrive_test -c "DROP DATABASE IF EXISTS clouddrive_perf" -c "CREATE DATABASE clouddrive_perf"
    # Apply the migrations' SQL directly (no Prisma CLI, so no .env file is ever read).
    for dir in $(ls "$HERE/../prisma/migrations" | grep -v lock | sort); do
      sed '1s/^\xEF\xBB\xBF//' "$HERE/../prisma/migrations/$dir/migration.sql" | "${PSQL[@]}" -d clouddrive_perf >/dev/null
    done
    "${PSQL[@]}" -d clouddrive_perf < "$HERE/seed.sql"
    "${PSQL[@]}" -d clouddrive_test \
      -c "ALTER DATABASE clouddrive_perf SET log_min_duration_statement = 0" \
      -c "ALTER DATABASE clouddrive_perf SET log_parameter_max_length = -1"
    ;;
  drop)
    "${PSQL[@]}" -d clouddrive_test -c "DROP DATABASE IF EXISTS clouddrive_perf"
    ;;
  *)
    LABEL="$1"
    SRC_URL=$(node -e 'console.log(require("node:url").pathToFileURL(process.argv[1]).href + "/")' "$HERE/../src")
    SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    sleep 1
    (cd "$OUT" && NODE_ENV=test LOG_LEVEL=silent JOBS_ENABLED=false \
      DATABASE_URL="postgresql://clouddrive:clouddrive_test_password@localhost:5433/clouddrive_perf" \
      JWT_ACCESS_SECRET=perf-only-secret-that-is-at-least-32-chars \
      STORAGE_SIGNING_SECRET=perf-only-signing-secret-at-least-32-chars \
      STORAGE_LOCAL_ROOT="$OUT/storage" UPLOAD_TMP_DIR="$OUT/tmp" \
      node "$HERE/capture.mjs" "$SRC_URL" > "$OUT/$LABEL.app.txt")
    sleep 1
    docker logs --since "$SINCE" "$CONTAINER" > "$OUT/$LABEL.log" 2>&1
    (cd "$OUT" && node "$HERE/explain.mjs" "$LABEL.log" "$LABEL.json" > "$LABEL.plans.txt")
    (cd "$OUT" && node -e '
      const r = require(process.argv[1]); const by = {};
      for (const x of r) { by[x.step] ??= { ms: 0, n: 0 }; by[x.step].ms += x.executionMs; by[x.step].n += 1; }
      for (const [k, v] of Object.entries(by)) console.log(k.padEnd(26), v.ms.toFixed(2).padStart(8), "ms", `(${v.n} queries)`);
    ' "$OUT/$LABEL.json" | tee "$OUT/$LABEL.txt")
    ;;
esac
