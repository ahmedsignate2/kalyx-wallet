import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { extensionRegistry } from './scripts/registryPlugin.ts';

// Faux navigateur de WXT (`fakeBrowser`) : storage, alarms, idle simulés en mémoire.
export default defineConfig({
  plugins: [WxtVitest(), extensionRegistry()],
  test: { include: ['lib/**/*.test.ts', 'ui/**/*.test.ts'], testTimeout: 30_000 },
});
