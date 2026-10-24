import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { fileURLToPath } from 'node:url';
import { extensionRegistry } from './scripts/registryPlugin.ts';

// Faux navigateur de WXT (`fakeBrowser`) : storage, alarms, idle simulés en mémoire.
export default defineConfig({
  plugins: [WxtVitest(), extensionRegistry()],
  resolve: { alias: { '@ton/crypto': fileURLToPath(new URL('../src/crypto/tonCoreCrypto.ts', import.meta.url)) } },
  test: { include: ['lib/**/*.test.ts', 'ui/**/*.test.ts'], testTimeout: 30_000, setupFiles: ['./scripts/vitestSetup.ts'] },
});
