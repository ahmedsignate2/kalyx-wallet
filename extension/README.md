# Kalyx Wallet — extension de navigateur

Extension Manifest V3 pour Chromium (Chrome, Brave, Edge). Elle réutilise le
cœur de l'app (`../src` : dérivation des clés, coffre, réseaux) ; seule
l'interface et les adaptateurs de plateforme sont propres à l'extension.

```bash
cd extension
npm install          # dépendances de l'extension uniquement (pas celles de l'app)
npm run build        # → .output/chrome-mv3
npm test             # tests unitaires (Vitest, faux navigateur)
npm run test:smoke   # charge l'extension dans Chromium et vérifie le cœur
npm run icons        # régénère les icônes depuis ../assets/icon.png
```

Charger en développement : `chrome://extensions` → « Mode développeur » →
« Charger l'extension non empaquetée » → `extension/.output/chrome-mv3`.

Le cahier des charges (sécurité, onboarding, multi-chaîne) et le plan par lots
sont dans l'historique du projet ; ce dossier en est le lot 0 (fondations).
