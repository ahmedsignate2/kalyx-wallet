# Publier le VDP sur une plateforme — kit prêt à coller

**Publié** sur Intake Security : https://intakesecurity.io/programs/kalyx-wallet · référencé dans l'annuaire disclose.io (diodb).

Ce dépôt est la **référence** du programme : politique [`VDP.md`](VDP.md),
périmètre [`SCOPE.md`](SCOPE.md) (copie importable [`scope.csv`](scope.csv)),
remerciements [`ACKNOWLEDGMENTS.md`](ACKNOWLEDGMENTS.md). Une plateforme ne fait
que les reprendre. Ce fichier sert à remplir son formulaire sans rien réécrire.

## 1. Canaux qui fonctionnent dès maintenant (gratuits)

| Canal | État | Action |
| --- | --- | --- |
| security@kalyxwallet.com | actif : accusé immédiat avec numéro KLX, tri, alerte Telegram | — |
| Signalement privé GitHub | actif (bouton « Report a vulnerability » de l'onglet *Security*) | Pour être notifié : *Watch → All activity* sur le dépôt, ou *Custom → Security alerts*. |
| `security.txt` (RFC 9116) | à jour dans le code | Redéployer le site (`web/`) et le dashboard (`extension/web/`) pour publier la nouvelle version. |
| Annuaire disclose.io (diodb) | gratuit, à demander | Référence le programme dans l'annuaire public des politiques de divulgation (https://github.com/disclose/diodb). |

## 2. Plateformes

| Plateforme | Pour Kalyx | Coût |
| --- | --- | --- |
| HackerOne (VDP) | possible, visibilité maximale | payant pour une entreprise ; l'édition gratuite « Community » est réservée aux projets open source (ce dépôt est sous licence propriétaire) |
| YesWeHack, Intigriti, Bugcrowd | possibles (YesWeHack et Intigriti sont européens) | sur devis |
| Immunefi | spécialisé crypto, mais orienté primes (bug bounty) | primes à financer |
| GitHub (signalement privé) | intégré au dépôt, suffisant pour démarrer | gratuit |

Une fois une plateforme choisie : ajouter son lien dans `SECURITY.md`
(section *Reporting a vulnerability*), dans les deux `security.txt`
(`web/public/.well-known/security.txt` et `extension/web/vite.config.ts`) et en
tête de `VDP.md`.

## 3. Champs du formulaire (en anglais, comme les plateformes)

**Program name**: Kalyx Wallet

**Website**: https://kalyxwallet.com

**Program type**: Vulnerability Disclosure Program (no monetary rewards; public credit with consent)

**Short description** (≈ 150 caractères):
> Non-custodial crypto wallet (Android app, browser extension, web dashboard). Keys never leave the user's device. Help us keep it that way.

**Policy**: le contenu de [`VDP.md`](VDP.md), à partir de « Kalyx Wallet is a non-custodial crypto wallet ».

**Scope**: importer [`scope.csv`](scope.csv) (colonnes au format HackerOne :
`identifier, asset_type, instruction, eligible_for_bounty, eligible_for_submission, max_severity`).
Sur une autre plateforme, recopier le tableau de [`SCOPE.md`](SCOPE.md).

**Response targets**: first response 3 business days · triage 10 business days ·
critical/high fix usually within 30 days · coordinated disclosure 90 days.

**Safe harbor**: section *Safe harbor* de [`VDP.md`](VDP.md) (alignée sur disclose.io).

**Disclosure**: coordinated; public disclosure after the fix or 90 days, whichever comes first.

**Submission form, required fields**: affected asset and version (app version and
build, extension version or commit hash) · steps to reproduce · impact · proof of
concept. Remind: never include a recovery phrase, private key, PIN, password or API key.

## 4. Avant d'ouvrir le programme au public

- [x] Signalement privé GitHub activé (§ 1).
- [ ] Site et dashboard redéployés (nouveau `security.txt`).
- [ ] Versions de `SCOPE.md` / `scope.csv` = dernière release publiée.
- [ ] Un essai de bout en bout : un mail de test à security@ reçoit son accusé et arrive dans le dashboard support.
- [x] Lien de la plateforme ajouté partout (§ 2) : Intake Security.
