/**
 * Minimal jest config for @d3/database unit tests. The Supabase admin client is
 * mocked (or simply unused) in these tests, so they run offline with no DB
 * connection. Matches every *.test.ts under src/ — run explicitly:
 *   npx jest --config libraries/database/jest.config.cjs
 *
 * Exception: *.integration.test.ts is deliberately excluded. Those suites talk
 * to a real local Supabase stack (`npx supabase start`) and assert behaviour
 * only Postgres can provide — a partial unique index rejecting a second owner,
 * concurrent INSERTs collapsing to a single row. Mocking that away would leave
 * the test asserting the mock, so they stay manual-run and out of CI.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'database',
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          isolatedModules: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Setting this replaces jest's default, so '/node_modules/' has to be
  // restated — dropping it would let jest walk dependency test files.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
};
