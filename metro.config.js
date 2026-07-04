// Configuration Metro par défaut d'Expo.
// Indispensable notamment pour que les polices (.ttf d'@expo/vector-icons) et
// autres assets soient résolus (assetExts inclut ttf, otf, png, svg, etc.).

// Désactive le "lazy bundling" de Metro en dev. Sinon Expo découpe chaque
// import() dynamique (le SDK WalletConnect chargé à la volée dans
// lib/walletconnect.ts::init) en bundles séparés dont les IDs de modules se
// désynchronisent du bundle principal → crash "Requiring unknown module NNNN".
// On force la variable ici pour que ce soit robuste QUELLE QUE SOIT la commande
// de lancement (npx expo start comme npm start) : @expo/cli lit
// process.env.EXPO_NO_METRO_LAZY à la volée à chaque requête de bundle.
process.env.EXPO_NO_METRO_LAZY = '1';

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
