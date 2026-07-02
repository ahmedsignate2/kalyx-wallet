# 5. Risques de sécurité à éviter

C'est **le document le plus important**. Dans un wallet non-custodial, une seule faille = fonds perdus, sans recours possible. La règle : **la sécurité prime toujours sur la fonctionnalité et sur le délai.**

## 5.1 Gestion des clés & de la seed

| Risque | Contre-mesure |
|--------|---------------|
| Seed/clé stockée en clair (ex. AsyncStorage) | **Jamais.** Uniquement dans `expo-secure-store` (Keychain/Keystore), + surcouche AES-GCM chiffrée par une clé dérivée du PIN/biométrie. |
| Clé privée qui traîne en mémoire | La clé en clair n'existe **que pendant la signature**, dans `KeyManager`, puis on la remet à zéro (zeroize `Uint8Array`). Jamais stockée dans un state global. |
| Seed loggée par erreur | Interdiction absolue de `console.log` sur seed/clé. Lint/règle CI qui bloque. Désactiver les logs en prod. |
| Seed envoyée sur le réseau | Aucun appel réseau ne doit contenir de secret. À vérifier au proxy (Charles/mitmproxy) : seules des **adresses publiques** partent. |
| Aléatoire faible à la génération | `react-native-get-random-values` importé **en tout premier**. Ne jamais utiliser `Math.random()` pour de la crypto. |

## 5.2 Écrans sensibles (affichage de la seed)

| Risque | Contre-mesure |
|--------|---------------|
| Capture / enregistrement d'écran de la seed | `FLAG_SECURE` sur Android, masquage du contenu à l'aperçu multitâche sur iOS, sur les écrans seed/backup uniquement. |
| Seed copiée dans le presse-papier | Éviter au maximum ; si copie, vider le presse-papier après un court délai et avertir l'utilisateur. |
| Seed visible en arrière-plan (app switcher) | Écran de garde (overlay/blur) quand l'app passe en arrière-plan. |
| Utilisateur qui screenshote sa seed « pour la garder » | Avertissement UX explicite : « ne prends pas de photo, écris-la sur papier ». |

## 5.3 Authentification locale

| Risque | Contre-mesure |
|--------|---------------|
| PIN trop faible / brute force | Longueur minimale, **délai progressif** et blocage temporaire après N tentatives. PIN stocké **haché** (jamais en clair). |
| Contournement de la biométrie | La biométrie **débloque** l'accès à la clé de chiffrement stockée dans le secure enclave, elle ne remplace pas le chiffrement. Fallback PIN. |
| Pas de re-verrouillage | Auto-lock après inactivité + verrouillage au passage en arrière-plan. |

## 5.4 Transactions

| Risque | Contre-mesure |
|--------|---------------|
| Envoi non voulu / erreur de montant | Écran de confirmation obligatoire montrant destinataire, montant, frais, réseau. Rien ne part sans un tap explicite. |
| Adresse malformée / mauvais réseau | Validation stricte de l'adresse selon la chaîne + checksum EVM. Avertir si adresse jamais utilisée. |
| Frais de gas aberrants | Estimation + garde-fous (borne max), affichage clair des frais en fiat. |
| Phishing / mauvaise adresse copiée (clipboard hijacking) | Afficher l'adresse complète à la confirmation, permettre le scan QR, comparer début/fin. |

## 5.5 Plateforme & environnement

| Risque | Contre-mesure |
|--------|---------------|
| Appareil rooté / jailbreaké | Détection (phase 5) + avertissement fort ; le secure storage y est moins fiable. |
| Réseau man-in-the-middle | HTTPS only, épingler les endpoints RPC si possible, rejeter le trafic non chiffré. |
| App fantôme / clone malveillant | Signature de l'app, distribution via stores officiels uniquement. |
| Deep links malveillants | Valider et sanitiser tout paramètre entrant par deep link avant action. |

## 5.6 Chaîne d'approvisionnement (supply chain)

| Risque | Contre-mesure |
|--------|---------------|
| Dépendance npm compromise (vol de seed) | Minimiser les dépendances, préférer `@noble`/`@scure` (audités, zéro dépendance). Lockfile commité, `npm audit` en CI, mises à jour contrôlées. |
| Typosquatting de package | Vérifier chaque nom de package, épingler les versions, review des mises à jour de deps crypto. |
| Postinstall scripts malveillants | Auditer les scripts d'install, `--ignore-scripts` quand possible. |

## 5.7 Ce qu'on ne fait JAMAIS

- ❌ Écrire sa propre crypto (chiffrement, courbes, dérivation).
- ❌ Envoyer une seed/clé à un serveur, même « juste pour un backup ».
- ❌ Stocker un secret hors du secure storage.
- ❌ Logger un secret, même en debug.
- ❌ Mettre de vrais fonds avant un **audit de sécurité externe** (voir phase 5).

## 5.8 Checklist avant toute mise en prod

- [ ] Aucun `console.log` de secret (vérifié par lint + CI).
- [ ] Preuve réseau : aucune requête ne contient de clé/seed.
- [ ] Seed exportée = mêmes adresses qu'un wallet de référence (MetaMask).
- [ ] Écrans seed protégés contre capture d'écran.
- [ ] Brute-force PIN limité et testé.
- [ ] Auto-lock + verrouillage arrière-plan testés.
- [ ] `npm audit` propre, dépendances crypto épinglées et vérifiées.
- [ ] Revue de sécurité externe réalisée.
