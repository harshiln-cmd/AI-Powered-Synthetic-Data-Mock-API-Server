import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for `@mock-api-engine/api`.
 *
 * - `environment: 'node'` — this is a Fastify backend, not browser code, so
 *   there's no DOM/jsdom overhead to pay for.
 * - `globals: false` — tests explicitly import `describe`/`it`/`expect`/`vi`
 *   from 'vitest' rather than relying on injected globals, which keeps
 *   TypeScript's strict typing intact in the test files themselves.
 * - `clearMocks`/`restoreMocks` — every test in Phase 4 relies on mocked
 *   Redis/Mongo/OpenAI calls; resetting between tests avoids one test's
 *   `mockResolvedValueOnce` leaking into the next.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    clearMocks: true,
    restoreMocks: true,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: process.env.CI ? { junit: './reports/junit.xml' } : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/server.ts', 'src/**/*.test.ts', 'src/routes/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      // Lets tests (and the code under test) resolve the shared Zod
      // package the same way the monorepo's tsconfig paths do, without
      // needing it pre-built for the test run.
      '@mock-api-engine/schema': path.resolve(__dirname, '../../packages/schema/src'),
    },
  },
});
