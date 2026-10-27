import { defineConfig } from 'vitest/config';

// One root run covers every workspace. CI runs with AI_PROVIDER=mock; no test may call a real model.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'data/test/**/*.test.ts'],
    environment: 'node',
    env: { AI_PROVIDER: 'mock' },
  },
});
