# Query performance (Phase 7)

Measured on 2026-11-23 with `EXPLAIN (ANALYZE, BUFFERS)` against a throwaway database
(`clouddrive_perf` in the test container), never against development data.

## Data set

| Table           | Rows    | Notes                                                                                       |
| --------------- | ------- | ------------------------------------------------------------------------------------------- |
| `users`         | 2,000   | one **heavy** user, 1,999 typical ones                                                      |
| `files`         | 150,000 | heavy user: **50,000** (20% in the root, rest in 500 folders, 5% in trash); others ~50 each |
| `folders`       | 10,495  | heavy user: 500                                                                             |
| `shares`        | 25,000  | heavy user: 5,000 (60% active, 20% expired, 20% revoked)                                    |
| `activity_logs` | 200,000 | heavy user: 50,000                                                                          |

## Method

1. `server/perf/run.sh setup` creates the database from the migration SQL and `seed.sql`.
2. `run.sh <label>` runs the **app's own repository calls** for each hot page
   (`capture.mjs`), so the SQL is exactly what Prisma sends. Postgres logs every statement
   of that database; `explain.mjs` re-runs each one under `EXPLAIN ANALYZE` (one warm-up,
   then the **median of 5**) and sums them per page.
3. `candidates.sh` tries each candidate index alone (create, `VACUUM ANALYZE`, measure, drop).

Times below are database execution time per page (all its statements), heavy user unless noted.
Run-to-run noise is about ±3–5 ms on the larger numbers.

## Results

| Page / query                 |     Before |      After | What changed                                     |
| ---------------------------- | ---------: | ---------: | ------------------------------------------------ |
| My Files: root listing       |    48.5 ms |    18.0 ms | `isShared` looked up for the page only           |
| My Files: one folder         |     1.4 ms |     0.7 ms |                                                  |
| My Files: newest everywhere  |    94.4 ms |    20.5 ms | same                                             |
| Search "report"              |    39.3 ms |    37.4 ms | (unchanged, see below)                           |
| Trash page                   |     9.3 ms |     7.6 ms |                                                  |
| Shared links (active / all)  | 56 / 61 ms | 60 / 64 ms | (unchanged, see below)                           |
| Admin users: newest / search | 45 / 47 ms |  4.8 / 4.9 | file counts for the page's users only            |
| Admin users: by storage      |    48.1 ms |    27.1 ms | same                                             |
| Admin stats                  |   196.4 ms |   165.0 ms | top users' file counts                           |
| Dashboard: recent files      |    48.2 ms |     1.0 ms | `isShared` for 8 files instead of a full join    |
| Typical user: root listing   |    18.5 ms |     1.7 ms | the old plan scanned every share on the platform |
| Typical user: recent files   |    18.3 ms |     0.8 ms | same                                             |

### The fix: Prisma's filtered `_count`

`include: { _count: { select: { shares: { where } } } }` (for `isShared`) and the same for
the admin users' `fileCount` look cheap, but Prisma turns them into a `LEFT JOIN` on an
aggregate over the **whole** related table. EXPLAIN showed a sequential scan of all
25,000 shares for every file listing, and a parallel scan of all 150,000 files to show
20 users. The cost grew with the size of the platform, not with the page.

Both are now one extra, small query for exactly the rows on the page
(`withShareState` in `file.repository.js`, `withFileCounts` in `admin.repository.js`),
which uses the existing `shares(file_id)` and `files(user_id, …)` indexes. The API is
unchanged, and tests cover `isShared` and `fileCount` everywhere they appear.

### Candidate indexes (none added)

| Candidate                                                      | Effect                                                                                                                                   | Decision |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| partial indexes `WHERE deleted_at IS NULL AND status='ACTIVE'` | **never used**: Prisma sends `status = CAST('ACTIVE'::text AS "FileStatus")`, which the planner can't match to a partial index predicate | no       |
| `(user_id, folder_id, original_name, id)`                      | within noise; the root listing didn't use it                                                                                             | no       |
| `(user_id) INCLUDE (category, size_bytes, deleted_at, status)` | admin users by storage 31 → 17 ms, newest 20 → 14 ms; dashboard trash total 3 → 6 ms; one more index on the busiest table                | no       |
| `gin (user_id, original_name gin_trgm_ops)` (`btree_gin`)      | search 17.4 → 7.1 ms per query, but the planner then also picks it for plain `user_id` lookups: shares 28 → 33 ms, dashboard 22 → 28 ms  | no       |

Rule followed: add an index only if EXPLAIN proves a clear net gain. None did once the
query shapes were fixed.

## Known limits (follow-ups)

- **Shared links for a very heavy sharer (~30 ms per query)**: shares have no `user_id`, so the
  list joins all of the owner's files with the shares table. Fix when needed: a denormalised
  `shares.user_id` with an index on `(user_id, created_at DESC, id)` (schema change).
- **Search across 150k files (~19 ms per query)**: the trigram index finds matches for all
  users first. The `btree_gin` index above halves it, at a cost elsewhere; revisit if search
  gets slow on real data.
- **Admin stats (~165 ms)** are whole-platform aggregates (sequential scans by nature). Fine
  for an admin page; cache them (e.g. one minute) if the platform grows a lot.
- Re-run `server/perf/run.sh` on RDS in Phase 8: plans depend on the server's settings.
