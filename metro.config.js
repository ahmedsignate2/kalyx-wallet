const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro à ignorer complètement node_modules pour le file watching (évite ENOSPC)
config.watcher.watchman = {
  ignored_folders: ['node_modules', '.git', '.expo']
};
config.watcher.additionalExts = [];
// Option pour forcer le polling si nécessaire au niveau de Metro
config.watcher.usePolling = true;
config.watcher.interval = 1000;

/*
 * `@ton/crypto` remplacé par `src/crypto/tonCoreCrypto.ts`. Sa variante mobile
 * exige le module natif `react-native-fast-pbkdf2`, absent de l'app, alors que
 * `@ton/core` ne lui emprunte que trois fonctions. Explication complète dans ce
 * fichier ; jest.config.js fait la même substitution, pour que les tests
 * exécutent le même code que l'app.
 */
const path = require('path');
const TON_CRYPTO_SHIM = path.resolve(__dirname, 'src/crypto/tonCoreCrypto.ts');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@ton/crypto') return { type: 'sourceFile', filePath: TON_CRYPTO_SHIM };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
