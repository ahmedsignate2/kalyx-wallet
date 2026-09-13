// Point d'entrée de l'app mobile.
// 1) polyfills crypto AVANT tout le reste.
import './polyfills';

// 2) Logs de démarrage + capture des erreurs JS non gérées (visibles via
//    logcat / la console Metro), pour ne plus avoir de fermeture silencieuse.
console.log('[Kalyx] index.js : démarrage');

const g = globalThis;
if (g && g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
  const previous = g.ErrorUtils.getGlobalHandler ? g.ErrorUtils.getGlobalHandler() : null;
  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(
      '[Kalyx] Erreur JS non gérée',
      isFatal ? '(FATALE)' : '',
      ':',
      error && error.message,
    );
    if (error && error.stack) console.error('[Kalyx] stack :', error.stack);
    if (previous) previous(error, isFatal);
  });
}

// Capture aussi les rejets de promesses non gérés (best-effort).
if (g && typeof g.addEventListener === 'function') {
  g.addEventListener('unhandledrejection', (e) => {
    console.error('[Kalyx] Promesse rejetée non gérée :', e && (e.reason?.message || e.reason));
  });
}

// 3) Enfin, le routeur Expo (require : non hoisté, s'exécute après le setup).
require('expo-router/entry');
