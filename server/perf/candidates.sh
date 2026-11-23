#!/usr/bin/env bash
# Tries each candidate index ALONE: create → VACUUM ANALYZE → EXPLAIN the captured SQL
# → drop. Prints the steps whose time changed by more than 1 ms.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)/out"; mkdir -p "$D"
P="docker exec -i clouddrive-db-test psql -U clouddrive -d clouddrive_perf -q -v ON_ERROR_STOP=1"
cd "$D"
$P -c "DROP INDEX IF EXISTS cand_listing_name, cand_active_usage, cand_newest, cand_user_name_trgm" -c "VACUUM ANALYZE files"
node ../explain.mjs "${1:-current}.log" base.json >/dev/null

declare -A CANDS=(
  [name_order]="CREATE INDEX cand ON files (user_id, folder_id, original_name, id)"
  [usage_cover]="CREATE INDEX cand ON files (user_id) INCLUDE (category, size_bytes, deleted_at, status)"
  [user_trgm]="CREATE INDEX cand ON files USING gin (user_id, original_name gin_trgm_ops)"
)
for name in name_order usage_cover user_trgm; do
  $P -c "${CANDS[$name]}" -c "VACUUM ANALYZE files"
  node ../explain.mjs "${1:-current}.log" "cand-$name.json" >/dev/null
  $P -c "DROP INDEX cand"
  echo "== $name: ${CANDS[$name]}"
  node -e '
    const a = require("./base.json"), b = require("./cand-'"$name"'.json");
    a.forEach((x, i) => { const d = b[i].executionMs - x.executionMs;
      if (Math.abs(d) > 1) console.log("  ", x.step.padEnd(26), x.executionMs.toFixed(2).padStart(7), "->", b[i].executionMs.toFixed(2).padStart(7), "ms", b[i].plan.includes("cand") ? "(uses it)" : ""); });'
done
