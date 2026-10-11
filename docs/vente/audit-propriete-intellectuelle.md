# Kalyx Wallet — Audit de propriété intellectuelle

9 octobre 2026 · KALYX (Ahamed Signate)

## Verdict

Le code est cessible : il est sous licence propriétaire au nom de KALYX (Ahamed Signate) et toutes ses dépendances sont sous licences permissives. Deux points bloquent pourtant une vente propre : la licence WalletConnect et l'origine des sons.

Actions avant de signer :

- [x] Fait le 11 octobre 2026 : la mention « Portions © 2025 Reown, Inc. All Rights Reserved » figure en pied de l'écran À propos, et un écran « Licences tierces » contient la copie complète de la licence WalletConnect (15 langues).
- [ ] Obtenir l'accord écrit de Reown pour transférer la licence WalletConnect à l'acheteur, ou prévoir que l'acheteur signe la sienne.
- [ ] Expliquer à l'acheteur la grille Reown : un wallet self-custodial (sans connexion SIWX/SIWE ni wallet embarqué, ce qui est le cas de Kalyx) n'a pas de plafond chiffré d'utilisateurs (« within acceptable limits ») ; la limite gratuite réelle est de 2,5 millions d'appels RPC par mois, au-delà desquels le service WalletConnect est coupé (connexion aux dApps et tableau de bord web) jusqu'au passage en Pro (890 $/an). Le texte de la licence mentionne encore 500 utilisateurs actifs : faire confirmer par écrit par Reown.
- [ ] Prouver l'origine des sons send.mp3 et success.mp3 (créés par toi, ou licence d'achat).
- [ ] Rattacher ou faire céder le dépôt gadget00522/nova-mise-a-jour s'il contient du code repris dans kalyx-wallet.
- [ ] Déposer la marque « Kalyx » (INPI ou EUIPO) si ce n'est pas fait : une marque non déposée vaut moins.

## Ce qui appartient au vendeur

Le code, le design et la documentation sont à KALYX (Ahamed Signate), sous licence propriétaire « source-available » : lecture et évaluation seulement, aucune réutilisation sans accord écrit.

| Actif | Preuve | À vérifier |
| --- | --- | --- |
| Code source kalyx-wallet (910 fichiers) | Fichiers LICENSE et COPYRIGHT au nom de KALYX | Que tous les commits viennent de toi (aucun contributeur externe) |
| Dépôt kalyx-wallet-release | Publié par la chaîne de build | — |
| Dépôt gadget00522/nova-mise-a-jour | Contient le même code | Propriétaire du compte gadget00522 ; céder ou fermer |
| Logo (soleil à 16 rayons), design « Nova » | Créés dans le projet | Si un designer externe a contribué : cession écrite |
| Sons d'envoi et de réception | Ajoutés par Ahmed Signate le 25 août 2026 | Origine et droits |
| Textes du site et de l'app (15 langues) | Rédigés dans le projet | — |

## Licences tierces

Sur les 60 dépendances directes de l'app, 54 sont sous MIT ou Apache-2.0 et 2 sous MIT avec polices OFL ; seules les 4 dépendances WalletConnect ont une licence propriétaire.

| Élément | Licence | Conséquence pour la vente |
| --- | --- | --- |
| 53 dépendances MIT, 1 Apache-2.0 | Permissives | Aucune ; conserver les mentions de copyright |
| WalletConnect (core, sign-client, pay, react-native-compat) | WalletConnect Community License (Reown, 20 août 2025) | Mention « Portions © 2025 Reown, Inc. » et copie de la licence : présentes dans l'app depuis le 11 octobre 2026 ; licence non cessible sans accord écrit de Reown ; gratuite pour un wallet self-custodial jusqu'à 2,5 millions d'appels RPC par mois (Pro 890 $/an au-delà), seuil de 500 utilisateurs à faire confirmer par Reown |
| Polices Inter, Outfit, IBM Plex Sans, Space Grotesk | SIL OFL 1.1 | Libres, y compris en usage commercial |
| Police General Sans (police de l'app) | ITF Free Font License (Fontshare) | Usage commercial gratuit ; vérifier les conditions d'intégration dans une app sur fontshare.com |
| Avatars (Fluent Emoji, Microsoft) | MIT | Fichier LICENSE présent dans assets/avatars |
| Logos des réseaux et jetons (Bitcoin, Ethereum, Solana, TON…) | Marques de leurs projets | Usage descriptif courant ; ne pas suggérer de partenariat |
| Sons send.mp3 et success.mp3 | Inconnue | Origine à prouver avant la vente |

Les alertes de sécurité npm concernent des outils de build non embarqués dans l'APK ; elles n'affectent pas la propriété.

## Comptes et actifs à transférer

La clé de signature Android est l'actif le plus critique : sans elle, l'acheteur ne peut pas publier de mise à jour installable par-dessus l'app existante.

| Actif | Ce qu'il faut faire |
| --- | --- |
| Clé de signature Android (keystore EAS) | Remise chiffrée à la clôture, empreinte SHA-256 vérifiée par l'acheteur |
| Projet Expo / EAS | Transfert du projet vers le compte de l'acheteur |
| Dépôts GitHub (kalyx-wallet, kalyx-wallet-release) | Transfert de propriété ; révoquer le jeton GH\_RELEASE\_TOKEN |
| Domaine kalyxwallet.com | Domaine loué : vérifier chez le loueur qu'il est enregistré à ton nom et transférable (code d'autorisation) ; sinon, le renouveler à ton nom avant la vente ou le vendre à part |
| Bot Telegram et canal @kalyxntw | Transfert via BotFather et changement de propriétaire du canal |
| Comptes Cloudflare (bot, relais TON) | Transfert du compte ou redéploiement chez l'acheteur |
| Clés d'API (Alchemy, Etherscan, Helius, WalletConnect, LI.FI, CoinGecko) | Jamais cédées : l'acheteur crée les siennes, les tiennes sont révoquées |
| Bénéficiaire des frais de swap | Variables de build (EXPO\_PUBLIC\_FEE\_RECIPIENT\_SOLANA…) et identifiant d'intégrateur LI.FI au nom de l'acheteur |
| Fiche Play Store (si publiée) | Transfert d'application entre comptes développeur Google |
