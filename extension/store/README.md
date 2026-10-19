# Textes du Chrome Web Store

| Fichier | Où il va |
|---|---|
| `listing-fr.md`, `listing-en.md` | Fiche du store : nom, résumé (132 caractères max), description |
| `PUBLISH.md` | Publier la bêta non répertoriée, pas à pas |
| `BETA.md` | Guide des testeurs : installer, quoi tester, signaler un problème |
| `RELEASE-NOTES.md` | Notes de version (jointes à la release GitHub) |
| `images/` | Captures 1280×800 et tuile 440×280, générées par `scripts/store-images.mjs` à partir de la vraie extension |
| `permissions.md` | Formulaire « Pratiques de confidentialité » : objet unique et justification de chaque permission |
| `privacy-fr.md`, `privacy-en.md` | Résumé de la politique propre à l'extension. La politique publiée est celle de l'app, https://kalyxwallet.com/privacy (§ 7, « Extension de navigateur Kalyx ») : c'est cette adresse qui va dans la fiche |

Tout ce qui est écrit ici décrit le code tel qu'il est. Si une fonction change
(nouveau service contacté, nouvelle permission), ces textes changent dans le
même commit.

Contact (le même que l'app) : support@kalyxwallet.com · Telegram @kalyxntw.
Politique de confidentialité (la même que l'app) : https://kalyxwallet.com/privacy.
