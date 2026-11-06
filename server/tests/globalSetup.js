import { execSync } from 'node:child_process';

/**
 * Runs once before all test files: brings the test database's schema up to date by
 * applying the same migrations production uses (`migrate deploy`, never `migrate dev`).
 */
export default function setup({ config }) {
  const databaseUrl = config.env.DATABASE_URL;

  // Safety net: tests delete data, so never let them touch a non-test database.
  if (!new URL(databaseUrl).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests: "${databaseUrl}" is not a *_test database.`);
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
