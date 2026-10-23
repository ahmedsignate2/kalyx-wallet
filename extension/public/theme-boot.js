/*
 * Thème de l'extension, posé AVANT le premier affichage : script classique
 * (pas un module, qui attendrait la fin du chargement), il ne fait que lire
 * une préférence locale. Nuit par défaut ; Crème ; ou Système (suit l'OS, en
 * direct). Même logique que ui/prefs.ts, qui écrit ce choix.
 */
(function () {
  var root = document.documentElement;
  var light = matchMedia('(prefers-color-scheme: light)');
  function choice() {
    try {
      return localStorage.getItem('kalyx.theme') || 'dark';
    } catch (e) {
      return 'dark';
    }
  }
  function apply() {
    var c = choice();
    if (c === 'light' || (c === 'system' && light.matches)) root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }
  apply();
  light.addEventListener('change', apply);
  // Changé dans une autre fenêtre de l'extension (réglages du panneau, popup…).
  addEventListener('storage', function (e) {
    if (e.key === 'kalyx.theme') apply();
  });
})();
