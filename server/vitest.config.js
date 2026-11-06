import { defineConfig } from 'vitest/config';

// Tests ALWAYS use the separate test database (docker compose service "db-test", port 5433),
// never the development database. globalSetup refuses to run against anything else.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://clouddrive:clouddrive_test_password@localhost:5433/clouddrive_test';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      // Test-only secret (not used anywhere real).
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      // Minimum bcrypt cost: keeps password hashing fast in tests.
      BCRYPT_ROUNDS: '4',
    },
    globalSetup: './tests/globalSetup.js',
    // Test files share one database, so run them one at a time to avoid interference.
    fileParallelism: false,
  },
});
