/**
 * Minimal jest config for @d3/openrouter unit tests. Every case feeds the
 * client a real Response through a mocked global fetch, so these run offline
 * and cost no API credits. Not part of the root `pnpm test` project list:
 *   npx jest --config libraries/openrouter/jest.config.cjs
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'openrouter',
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
};
