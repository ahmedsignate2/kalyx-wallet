// Configuration Metro par défaut d'Expo.
// Indispensable notamment pour que les polices (.ttf d'@expo/vector-icons) et
// autres assets soient résolus (assetExts inclut ttf, otf, png, svg, etc.).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
