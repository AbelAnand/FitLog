import { defineConfig } from 'vitest/config'

// Unit tests cover the logic that does not need a screen: records, streaks, units, the database,
// backup and restore.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
