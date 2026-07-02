# Politique de sécurité

Ce projet est un **wallet crypto non-custodial**. Une seule faille peut faire perdre des fonds **irrécupérables** aux utilisateurs. La sécurité prime sur les fonctionnalités et sur les délais, sans exception.

Ce document définit les règles du projet. Il complète l'analyse de risques détaillée dans [`docs/05-SECURITE.md`](docs/05-SECURITE.md).

---

## 1. Règles absolues (jamais négociables)

| # | Règle |
|---|-------|
| R1 | **Ne jamais logger** une seed, un mnémonique, une clé privée ou une passphrase — même en debug. (Vérifié en CI, job `secret-log-guard`.) |
| R2 | **Ne jamais transmettre** un secret sur le réseau. Aucune requête ne doit contenir de clé/seed. Seules des **adresses publiques** sortent de l'appareil. |
| R3 | **Ne jamais stocker** un secret en clair. Uniquement dans le secure storage matériel (Keychain iOS / Keystore Android), chiffré. |
| R4 | **Ne jamais écrire notre propre cryptographie.** On utilise des libs auditées (`@noble`, `@scure`, `ethers`) et on les tient à jour. |
| R5 | **La clé privée en clair n'existe que le temps d'une signature**, puis elle est remise à zéro. Jamais stockée dans un state global ou un cache. |
| R6 | **Ne jamais mettre de vrais fonds** avant un audit de sécurité externe (voir roadmap phase 5). Développement et tests sur **testnet** uniquement. |

## 2. Principes de conception

- **Isolation des secrets** : seuls les modules `src/crypto` et `src/security` manipulent des clés. L'UI ne reçoit que des clés publiques, adresses et signatures.
- **Prévention avant confirmation** : toute transaction exige une confirmation explicite montrant destinataire, montant, frais, réseau. Rien ne part sans action volontaire de l'utilisateur.
- **Défense en profondeur** : chiffrement applicatif (AES-GCM) *en plus* du secure storage matériel ; verrouillage PIN *et* biométrie.
- **Aléatoire sûr uniquement** : jamais `Math.random()` pour de la crypto. En mobile, `react-native-get-random-values` chargé au tout premier import.
- **Dépendances minimales** : chaque dépendance est une surface d'attaque. On privilégie les libs sans dépendances transitives, lockfile committé, mises à jour crypto revues manuellement.

## 3. Tests & intégration continue

- Tout module cryptographique ou métier arrive **avec ses tests dans le même commit**. Pas de code sensible sans test.
- La CI (`.github/workflows/ci.yml`) exécute à chaque push/PR : **typecheck strict**, **toute la suite de tests**, et le **garde-fou anti-log de secret**.
- **Objectif : 100 % des tests au vert avant toute fusion.** À configurer en *branch protection* sur `main` (checks requis : `Typecheck & tests`, `Anti-log de secret`).
- Les tests de crypto s'appuient sur des **vecteurs de référence connus** (BIP-39/44) et sur un **contrôle croisé entre deux implémentations indépendantes** (`@scure` vs `ethers`) : une régression d'une lib est détectée automatiquement.

## 4. Signaler une vulnérabilité

- **Ne pas** ouvrir d'issue publique pour une faille de sécurité.
- Signaler en privé par e-mail à l'équipe (adresse à définir : `security@…`) ou via un *security advisory* GitHub privé.
- Merci d'inclure : description, étapes de reproduction, impact estimé, et éventuel correctif proposé.
- Engagement : accusé de réception sous 72 h, correctif priorisé selon la gravité, et divulgation coordonnée une fois le correctif publié.

## 5. Périmètre

Couvre le code de ce dépôt. Les services tiers (RPC, agrégateurs de swap, on/off-ramps régulés) ont leur propre modèle de sécurité ; ils ne reçoivent **jamais** de secret et sont isolés dans des modules dédiés (voir catégories B et C de [`docs/07-DIFFERENCIATION.md`](docs/07-DIFFERENCIATION.md)).
