# Publier la bêta (non répertoriée) sur le Chrome Web Store

Une extension **non répertoriée** n'apparaît ni dans les recherches ni dans
les listes du store : seules les personnes qui ont le lien peuvent
l'installer. Elle passe quand même l'examen de Google.

## 1. Le paquet

Dans GitHub : onglet **Actions** → **Extension — paquet du store** →
**Run workflow** (branche `main`). Au bout de quelques minutes, l'artefact
`kalyx-extension` contient :

- `kalyx-extension-0.10.0-chrome.zip` : le fichier à déposer ;
- `SHA256SUMS.txt` et `BUILD-HASH.txt` : les empreintes.

Avec un tag `extension-v0.10.0` (poussé sur `main`), la même action crée en
plus une release GitHub « bêta » avec ces fichiers.

Sur un ordinateur, sans GitHub : `npm ci` (racine), `npm ci --prefix extension`,
puis dans `extension/` : `npm run build && npm run zip` → `.output/*.zip`.

## 2. Le compte développeur

1. https://chrome.google.com/webstore/devconsole, avec le compte Google de Kalyx.
2. Frais d'inscription uniques (5 $), vérification de l'adresse e-mail de contact.

## 3. Le dépôt

1. **Nouvel élément** → déposer le `.zip`.
2. **Fiche** : textes de `listing-fr.md` (langue par défaut) et
   `listing-en.md` (ajouter l'anglais). Images de `images/` :
   - captures 1280×800 : `fr-1-keys.png`, `fr-2-phrase.png` (et `en-…` pour l'anglais) ;
   - petite tuile 440×280 : `fr-tile-440x280.png` ;
   - icône 128×128 : déjà dans le paquet.
3. **Pratiques de confidentialité** : recopier `permissions.md` (objet unique,
   justification de chaque permission, pas de code distant, aucune donnée
   collectée). Politique : `https://kalyxwallet.com/privacy` (§ 7).
4. **Distribution** → Visibilité : **Non répertorié**. Régions : toutes.
5. **Envoyer pour examen.** Les portefeuilles crypto sont souvent examinés
   plus longtemps (quelques jours) ; Google peut demander des précisions sur
   l'accès à tous les sites : la réponse est dans `permissions.md`.

## 4. Inviter les testeurs

Une fois acceptée, la page de l'extension a une adresse
`https://chromewebstore.google.com/detail/…` : c'est ce lien qu'on envoie,
avec `BETA.md`.

## 5. Captures avec de vrais soldes et une vraie dApp

Pendant la bêta, sur un ordinateur avec un vrai portefeuille de test :
capture de l'écran (popup ou panneau latéral, fenêtre de signature d'une
vraie dApp), puis mise en page au même format :

```
FRAME=capture.png TITLE="Chaque signature expliquée." SUB="…" OUT=store/images/fr-3-sign.png node scripts/store-images.mjs
```

Jamais un solde, un site ou une adresse inventés.

## 6. Mise à jour

Monter `version` dans `extension/package.json` (0.9.1…), relancer l'action,
déposer le nouveau `.zip` dans la console (**Paquet** → **Importer un nouveau
paquet**). Chrome met à jour les testeurs tout seul.

## 7. Sortie publique

Après la bêta : retirer « beta » de `version_name` (wxt.config.ts), passer en
1.0.0, et Visibilité → **Public**.
