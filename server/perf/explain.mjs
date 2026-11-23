// Parses the Postgres log written during capture.mjs, then runs EXPLAIN ANALYZE on every
// captured statement (parameters inlined) and prints the slowest plan lines per step.
// Usage: node explain.mjs <pg.log> <out.json> [stepFilter]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [logPath, outPath, only] = process.argv.slice(2);
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);

// Statements can span lines; a new log entry starts with a timestamp.
const entries = [];
for (const line of lines) {
  if (/^\d{4}-\d{2}-\d{2} /.test(line)) entries.push(line);
  else if (entries.length) entries[entries.length - 1] += `\n${line}`;
}

const statements = [];
let step = null;
for (let i = 0; i < entries.length; i += 1) {
  const e = entries[i];
  const marker = e.match(/STEP: (.+?) \*\//);
  if (marker) {
    step = marker[1];
    continue;
  }
  const m = e.match(/duration: ([\d.]+) ms {2}(?:execute [^:]+|statement): ([\s\S]+)$/);
  if (!m || !step) continue;
  let sql = m[2].trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SELECT 1$|DEALLOCATE)/i.test(sql)) continue;
  const detail = entries[i + 1]?.match(/DETAIL: {2}Parameters: ([\s\S]+)$/i);
  if (detail) {
    const params = {};
    for (const p of detail[1].matchAll(/\$(\d+) = (NULL|'(?:[^']|'')*')/g)) params[p[1]] = p[2];
    sql = sql.replace(/\$(\d+)\b/g, (_, n) => params[n] ?? `$${n}`);
  }
  statements.push({ step, ms: Number(m[1]), sql });
}

const psql = (sql) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'clouddrive-db-test',
      'psql',
      '-U',
      'clouddrive',
      '-d',
      'clouddrive_perf',
      '-qAt',
    ],
    { input: `SET log_min_duration_statement = -1;\n${sql}`, encoding: 'utf8' },
  );

const results = [];
for (const s of statements) {
  if (only && !s.step.includes(only)) continue;
  if (!/^\s*(SELECT|WITH)/i.test(s.sql)) continue;
  // Median of 5 runs, after one warm-up, so caching doesn't decide the result.
  const times = [];
  let plan = '';
  for (let run = 0; run < 6; run += 1) {
    plan = psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${s.sql};`);
    const t = Number(plan.match(/Execution Time: ([\d.]+) ms/)?.[1]);
    if (run > 0) times.push(t);
  }
  times.sort((a, b) => a - b);
  results.push({ ...s, executionMs: times[2], plan });
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
for (const r of results) {
  const scans = r.plan
    .split('\n')
    .filter((l) => /Seq Scan|Index|Sort Method|Hash Join|Nested Loop|Bitmap/.test(l));
  console.log(`\n### ${r.step}  — ${r.executionMs} ms (median of 5)`);
  console.log(`SQL: ${r.sql.replace(/\s+/g, ' ').slice(0, 220)}…`);
  for (const l of scans.slice(0, 8)) console.log(`   ${l.trim().slice(0, 150)}`);
}
