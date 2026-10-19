import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Faux navigateur de WXT (`fakeBrowser`) : storage, alarms, idle simulés en mémoire.
export default defineConfig({
  plugins: [WxtVitest()],
  test: { include: ['lib/**/*.test.ts'], testTimeout: 30_000 },
});
