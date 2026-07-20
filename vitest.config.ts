import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['test/**/*.test.tsx', 'jsdom']],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // `server-only` throws unless the bundler sets the `react-server` export
      // condition, which Vitest does not. Stub it so server modules import in tests.
      'server-only': resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
