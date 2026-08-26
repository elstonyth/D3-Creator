/**
 * Minimal jest config for @d3/analyzer unit tests. Nothing here touches the
 * network, FFmpeg or the filesystem, so these run offline and cost no API
 * credits. Not part of the root `pnpm test` project list (root jest.config.ts
 * is `projects: ['<rootDir>/apps/frontend']`) — CI runs it explicitly, and so
 * can you:
 *   npx jest --config apps/analyzer/jest.config.cjs
 *
 * The `moduleNameMapper` is not optional: `@d3/openrouter` is a workspace-linked
 * TypeScript package with no build step, and without the mapping it does not
 * load under jest. `module: 'CommonJS'` is not optional either — the package is
 * `"type": "module"` and its tsconfig is `ESNext`, which jest's CJS runtime
 * cannot execute.
 *
 * PRD 1 §8.2: that CommonJS transform is why `src/config.ts` and
 * `scripts/cost-measure.ts` — the two files that use `import.meta.url` — are
 * unreachable from a test. NOTHING a test imports may import either of them,
 * directly or transitively. Values a test needs live in `contract.ts`, which
 * has no imports at all.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'analyzer',
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          isolatedModules: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@d3/openrouter$': '<rootDir>/../../libraries/openrouter/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
