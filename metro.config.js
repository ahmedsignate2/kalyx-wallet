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

module.exports = config;
