# TON (The Open Network) — ce qu'il faut savoir avant d'écrire une ligne

Document préparatoire. Aucun code TON n'est fonctionnel à ce jour : il n'existe
qu'un squelette (`src/domain/chains/v2/TonAdapterV2.ts`) qui refuse toutes les
opérations, et qui n'est enregistré nulle part.

Ce document existe parce que TON ne ressemble à aucune des trois chaînes déjà
gérées, et que trois de ses particularités font PERDRE DES FONDS si on les
découvre en cours de route. Mieux vaut les trancher avant.

---

## 1. La décision structurante : quelle dérivation ?

TON utilise ed25519, comme Solana. Mais il existe **deux façons incompatibles**
de passer d'une phrase de récupération à une clé, et elles donnent des adresses
DIFFÉRENTES pour la même phrase.

**a. La dérivation native TON.** La phrase (24 mots) passe par un PBKDF2-SHA512
avec le sel `TON default seed`, et les 32 premiers octets du résultat forment la
graine ed25519. Il n'y a pas de chemin de dérivation : une phrase donne UNE clé.
C'est ce que font Tonkeeper, TonHub et le portefeuille officiel. Les phrases TON
ont aussi leur propre règle de validité, distincte de BIP-39.

**b. SLIP-0010 sur `m/44'/607'/…`.** Le type de pièce 607 est TON. C'est ce
qu'utilise Ledger, et c'est la voie qui s'intègre sans friction à ce que Kalyx
fait déjà pour Solana.

**Conséquence à assumer, quel que soit le choix :** avec (b), l'adresse TON
qu'affichera Kalyx pour une phrase donnée NE SERA PAS celle que Tonkeeper
affiche pour la même phrase. Un utilisateur qui importe sa phrase Tonkeeper dans
Kalyx verra un compte vide et en conclura, légitimement, que le portefeuille est
cassé.

**Recommandation : (a), la dérivation native.** Un portefeuille qui n'affiche pas
les fonds d'une phrase importée est inutilisable, quelle que soit l'élégance de
son architecture. Le coût est une branche de dérivation qui ne ressemble à aucune
autre dans `signerFromSeed` — et le fait que notre seed BIP-39 déjà calculée ne
serve à rien ici : il faut la PHRASE, pas la graine. C'est la seule chaîne dans
ce cas, et cela remonte jusqu'à `deriveSigner` dans `walletStore`.

> **TRANCHÉ, PUIS CORRIGÉ (26/09) : la règle de Tonkeeper, et non (a) seule.**
>
> La recommandation ci-dessus oubliait un fait : **toutes les phrases que Kalyx
> crée sont BIP-39.** Relu dans le code de Tonkeeper
> (`tonkeeper-web/packages/core/src/service/mnemonicService.ts`), le choix ne se
> fait pas par portefeuille mais par PHRASE :
>
> 1. phrase TON valide (`mnemonicValidate` de `@ton/crypto`) → dérivation native ;
> 2. sinon phrase BIP-39 valide → SLIP-0010 sur **`m/44'/607'/0'`**, sans passphrase ;
> 3. sinon, invalide.
>
> Appliquer la native à tout aurait donné, pour chaque phrase Kalyx, une adresse
> TON différente de celle de Tonkeeper : le portefeuille vide que ce paragraphe
> voulait éviter, dans l'autre sens. L'ORDRE compte aussi : le contrôle TON ne
> regarde pas la longueur, donc une phrase BIP-39 de 12 mots peut le passer (une
> fois sur 256 environ) — Tonkeeper la dérive alors en native, nous aussi.
>
> Implémenté dans `tonKeys.ts` (`resolveTonKey`). Validé contre les cinq vecteurs
> officiels de `@ton/crypto`, et contre la fonction de chemin de Tonkeeper
> recopiée à l'identique pour produire les vecteurs BIP-39. Deux écarts de notre
> version précédente avec `@ton/crypto` ont été corrigés au passage : elle exigeait
> 24 mots (faux), et ne vérifiait pas que les mots sont dans la liste.
>
> **Conséquence pour l'import :** les phrases Tonkeeper ne passent PAS le contrôle
> BIP-39 (aucun des cinq vecteurs officiels ne le passe). L'import actuel, qui
> n'accepte que BIP-39, les refuserait toutes.

---

## 2. L'adresse n'est pas dérivée de la clé

Sur EVM, Bitcoin et Solana, l'adresse se calcule depuis la clé publique. **Sur
TON, non.** Une adresse TON est le hachage de l'état initial d'un contrat :
`hash(code, data)`. Le `code` est celui du contrat de portefeuille choisi, le
`data` contient la clé publique et un identifiant de sous-portefeuille.

Conséquence directe : **la même clé donne des adresses différentes selon la
version de contrat.** Les versions en circulation sont v3R2, v4R2 et W5 (v5).

> **TRANCHÉ : on crée en W5 (`v5r1`), on relit v4R2 et v3R2 à l'import.**
> W5 est le `defaultWalletVersion` de Tonkeeper dans toutes ses applications
> (mobile, web, extension, bureau, mini-app Telegram) : une phrase Kalyx importée
> dans Tonkeeper y retrouve la même adresse. Tonkeeper calcule aussi les adresses
> v3R1, v3R2, v4R2 et W5 bêta à l'import ; on couvre v4R2 et v3R2, où dorment les
> fonds des portefeuilles d'avant la W5. v3R1 et W5 bêta restent à ajouter si un
> cas réel se présente.
>
> Sur W5, le réseau entre dans le `wallet_id` (`−239` principal, `−3` test) : le
> réseau de test donne une AUTRE adresse, pas seulement une autre écriture.

**Implémenté** dans `tonWallet.ts`. Pour l'adresse, le code du contrat n'entre
que par son hachage et sa profondeur (la cellule `StateInit` le référence sans le
contenir) : deux constantes par version, relevées dans `@ton/core`. Vérifié sur
neuf clés × trois versions contre les adresses que calcule `@ton/ton`.

Cela casse une hypothèse implicite du reste du code : `deriveAccount(seed, index)`
rend une adresse. Sur TON, il faudra aussi la version de contrat — et `index`
n'a pas le même sens, la notion voisine étant le `subwallet_id`.

---

## 3. Adresses rebondissantes : le piège qui coûte des fonds

Une adresse TON s'écrit en base64url sur 36 octets : un octet de marqueur, un de
workchain, les 32 octets de hachage, et deux octets de CRC. **Le marqueur porte
un drapeau `bounceable`.**

- **Rebondissante** (`EQ…`) : si le contrat destinataire n'existe pas ou refuse
  le message, les fonds REVIENNENT à l'expéditeur, moins les frais.
- **Non rebondissante** (`UQ…`) : les fonds restent sur l'adresse même si le
  compte n'est pas encore déployé.

La règle pratique : on envoie en **non rebondissante** vers un portefeuille non
déployé, en **rebondissante** vers un contrat. Se tromper dans un sens fait
rebondir un paiement ; dans l'autre, cela peut l'envoyer dans un contrat
incapable de le traiter.

La même adresse s'écrit donc de deux façons, et **les deux sont valides**. Un
validateur d'adresse qui se contenterait de vérifier le CRC laisserait passer
les deux sans rien dire. `prepareSend` devra remonter un avertissement
`DESTINATION_NOT_WALLET` ou équivalent quand la forme ne correspond pas à l'état
réel du compte destinataire — ce qui suppose de LIRE cet état avant d'envoyer.

Il existe aussi un drapeau testnet dans ce même octet. Comme pour Bitcoin, une
adresse testnet doit être refusée sur le réseau principal.

---

## 4. Le compte doit être déployé

Un portefeuille TON n'existe on-chain qu'après le déploiement de son contrat. Le
premier message sortant doit embarquer l'`StateInit`, ce qui coûte quelques
fractions de TON.

Conséquence : **on ne peut pas envoyer depuis un compte qui n'a jamais reçu.**
Et l'avertissement `ACTIVATES_DESTINATION`, déjà prévu dans l'interface v2, sert
ici deux fois — au déploiement de son propre portefeuille, et à celui du
portefeuille de jeton du destinataire.

---

## 5. `seqno` et `valid_until`

TON n'a pas de nonce global. Chaque contrat de portefeuille tient un `seqno`,
lu par une méthode `get`. Un message porte un `valid_until` : passé cet instant,
il est refusé.

Cela correspond exactement aux champs déjà présents dans l'interface v2 :

| Notion TON | Champ v2 |
|---|---|
| `valid_until` | `SendDraft.expiresAt` |
| `seqno` au moment de la préparation | `BroadcastOutcome.opaque` |
| commentaire du transfert | `SendRequest.memo` |

Ces trois champs ont été ajoutés en migrant Solana et Bitcoin. Ils n'ont pas été
inventés pour TON, mais ils l'attendaient.

---

## 6. Le mémo n'est pas optionnel

Un transfert TON peut porter un **commentaire** : un corps de message dont les
32 premiers bits valent zéro, suivis du texte en UTF-8.

**Les plateformes d'échange l'exigent.** Un dépôt TON sans le mémo demandé
arrive sur l'adresse commune de la plateforme sans être attribué à un compte, et
le récupérer suppose un ticket au support — quand c'est possible.

C'est pour cette raison que `memo` a été mis dans `SendRequest` dès la
conception de la v2, et que `ChainCapabilities.memo` existe. L'écran d'envoi
devra afficher le champ quand la capacité est déclarée, et avertir quand il est
vide sur une destination qui ressemble à une plateforme.

---

## 7. Pas de paliers de frais

Les frais TON ne se négocient pas : le réseau les calcule et les prélève sur le
montant attaché au message. Il n'existe pas d'équivalent au prix du gaz ni au
sat/vB.

Donc `capabilities.feeTiers = false`, et l'écran d'envoi n'affichera pas de
sélecteur de vitesse — ce qui fonctionne déjà, puisque les paliers sont
gouvernés par la capacité depuis la migration v2.

Pour la même raison, **ni accélération ni annulation** : un message qui n'est
pas inclus avant son `valid_until` expire, et rien n'est débité. C'est la même
situation que Solana, et elle se traduit par `TxState.expired`.

---

## 8. Jetons

Les jetons TON ne vivent pas dans un registre central. Chaque détenteur a son
propre **contrat de portefeuille de jeton**, dont l'adresse se calcule par une
méthode `get` (`get_wallet_address`) sur le contrat maître du jeton.

Un transfert consiste à envoyer un message à SON portefeuille de jeton, qui
transmet à celui du destinataire. Trois conséquences :

1. **Envoyer un jeton coûte du TON.** Il faut attacher de quoi payer le message
   et son rebond (`forward_ton_amount`). Un solde de jeton sans TON est
   intransférable — le dire avant est indispensable.
2. **Le portefeuille de jeton du destinataire peut ne pas exister** et sera
   déployé au passage, à nos frais. D'où `ACTIVATES_DESTINATION`.
3. L'adresse du portefeuille de jeton doit être RÉSOLUE on-chain avant
   d'envoyer, exactement comme le programme d'un mint Token-2022 sur Solana.

---

## 9. Confirmation : pas d'identifiant avant l'envoi

Les trois chaînes actuelles rendent un identifiant de transaction dès la
signature. **TON, non.** Un message externe n'a pas de « hash de transaction »
au sens habituel ; on dispose du hachage du BOC envoyé, et la transaction qui en
résulte porte son propre identifiant, connu seulement après inclusion.

Les deux approches praticables :

- **Suivre le `seqno`** : s'il a augmenté, le message est passé. Simple, mais ne
  dit pas laquelle des transactions est la nôtre si plusieurs partent.
- **Chercher la transaction par le hachage du message** dans les transactions
  récentes du compte. Plus précis, plus bavard côté RPC.

`BroadcastOutcome.txid` devra porter le hachage du message, et `waitForTx` faire
la correspondance. Ce n'est pas un détail d'implémentation : c'est le seul moyen
de ne pas retomber dans « diffusé donc réussi », l'hypothèse qui faisait afficher
« envoyé » sur Solana pour une transaction abandonnée.

---

## 10. Dépendances et outillage

> **TRANCHÉ (26/09) : `@ton/core` 0.63.1 seul, épinglé ; `@ton/crypto` remplacé.**
>
> Sur React Native, `@ton/crypto` charge sa variante mobile, qui exige le module
> NATIF `react-native-fast-pbkdf2` dès l'import : le build aurait échoué. Plutôt
> qu'un module natif de plus (sans garantie de compatibilité avec RN 0.86) pour un
> PBKDF2 inutile — la dérivation passe par `@noble` —, `@ton/crypto` est remplacé
> par `src/crypto/tonCoreCrypto.ts`, dans `metro.config.js` ET `jest.config.js`.
> `@ton/core` ne lui emprunte que trois fonctions (`sha256_sync`, `sign`,
> `signVerify`) ; un test lit le code installé de `@ton/core` et échoue si une
> version future en appelle une autre. `.npmrc` (`legacy-peer-deps`) empêche npm
> d'installer `@ton/crypto` d'office.
>
> Vérifié par un vrai bundle Android et web (import temporaire, retiré ensuite) :
> notre module est pris, et ni `@ton/crypto`, ni `react-native-fast-pbkdf2`, ni
> tweetnacl, ni jssha n'y figurent. Coût : 106 Ko bruts pour `@ton/core`, 11 Ko
> pour notre code TON, code des contrats compris. Jest charge `@ton/core` en
> CommonJS sans transformation.
>
> Les dépendances changent : tout part dans le même build.


L'écosystème officiel est `@ton/core`, `@ton/crypto` et `@ton/ton`. Deux points
à vérifier AVANT de les ajouter :

1. **Le format des modules.** `@scure/btc-signer` est en ESM pur, ce qui a
   obligé à ajouter une transformation dans `jest.config.js`. Si les paquets TON
   le sont aussi, il faudra les ajouter au même motif — qui est ANCRÉ, et dont
   l'ancrage est précisément ce qui manquait la première fois.
2. **Le build.** Une dépendance native n'existe qu'après reconstruction de
   l'APK : à livrer avec un build.

---

## Ce que la v2 fournit déjà, et ce qu'il faudra ajouter

**Prêt :** `memo`, `expiresAt`, `BroadcastOutcome.opaque`, `activatesDestination`,
`TxState.expired`, capacités déclarées, signataire ed25519, effacement par
`withSigner`.

**À ajouter :**

| Besoin | Où |
|---|---|
| Famille `ton` | `ChainFamily` — fait |
| Dérivation native TON depuis la PHRASE | `signerFromSeed` ne suffit pas : il reçoit une graine, pas la phrase |
| Version de contrat de portefeuille dans la config | `ChainConfig` |
| Forme d'adresse (rebondissante ou non) dans le brouillon | Probablement un `DraftWarning` de plus |

Le point le plus coûteux est la dérivation : c'est la seule chaîne où la graine
BIP-39 déjà calculée ne sert à rien, et cela remonte jusqu'à `walletStore`.


---

## 12. État d'avancement

**Fait, pur, et validé contre l'écosystème (26/09).**

- `tonKeys.ts` — phrase → clé, avec la règle et l'ordre de Tonkeeper (§1).
- `tonMnemonic.ts` — dérivation native et contrôle de validité, alignés sur
  `@ton/crypto` : les cinq vecteurs officiels passent.
- `tonWallet.ts` — adresse d'une clé pour W5, v4R2 et v3R2, réseau principal et
  de test (§2).
- `tonAddress.ts` — analyse et écriture des adresses. **Corrigé :** l'écriture
  ajoutait `==` à la fin (50 caractères au lieu de 48), qu'aucun portefeuille
  n'accepte ; les tests ne comparaient jamais à une adresse réelle.
- `crypto/slip10.ts` — SLIP-0010 ed25519, désormais partagé par Solana et TON.
- `tonTransfer.ts` — construction et signature d'un transfert (message externe,
  BOC) pour W5, v4R2 et v3R2 : déploiement au premier envoi, commentaire (y
  compris long), plusieurs destinataires, réseau de test, envoi du solde entier.
  **Identique octet pour octet** à `@ton/ton` sur sept cas de référence produits
  avec le VRAI `@ton/crypto`. Refuse ce qui viserait un autre compte ou un autre
  réseau : état initial qui ne redonne pas l'adresse, clé qui n'est pas celle du
  compte, adresse de test sur le réseau principal, échéance en millisecondes.
- `tonWalletCode.ts` — code des trois contrats, vérifié contre le hachage utilisé
  pour les adresses.
- **Import et signature (magasin)** — une phrase Tonkeeper est RECONNUE
  (`classifyRecoveryPhrase`) et ouvre un portefeuille de type `tonPhrase`, limité
  à TON : aucune adresse EVM, Bitcoin ou Solana n'est dérivée d'elle, ni à
  l'import, ni au déverrouillage, ni à l'ajout de compte (refusé), ni à l'export de
  clé (refusé). Tant qu'aucun réseau TON n'est configuré, l'import le DIT
  (`import.TON_NOT_YET`, 15 langues) au lieu de « phrase invalide » ; il s'ouvrira
  de lui-même dès qu'une configuration TON existera. Les portefeuilles BIP-39
  reçoivent leur clé publique TON sur le compte 0 (rattrapée au déverrouillage
  pour les anciens). `deriveSigner` dérive TON depuis la PHRASE (`resolveTonKey`)
  et refuse de signer si la clé dérivée n'est pas celle dont l'adresse est
  affichée. Couvert par un scénario complet sur le vrai magasin
  (`lib/walletStoreTon.test.ts`, 13 étapes, chiffrement et dérivations réels).

Tous les vecteurs sont dans `tonkeeper-vectors.json`, avec leur provenance dans
`tonKeys.test.ts`. Aucun n'est calculé par le code testé.

**Envoi RÉEL sur le réseau de test (26/09) — de bout en bout, avec l'adaptateur.**
Portefeuille jetable (phrase BIP-39 générée et gardée hors du dépôt), alimenté
par @testgiver_ton_bot, adresse `0QAHnB2FOTQY4Y7W7Yp33rvQz6fIEzZ8398pbTweyDrrEu_5` :

| Étape | Résultat |
|---|---|
| Envoi 1 — compte non déployé | déploiement + transfert **confirmés en 3 s** ; le compte devient `wallet v5 r1`, seqno 1 |
| Envoi 2 — compte actif | **confirmé en 6 s**, seqno 2, frais estimés par le nœud |
| Historique | les deux envois avec leurs commentaires, et les reçus |

Le suivi a retrouvé chaque transaction par son hachage normalisé, et en a lu les
phases. Tout le chemin — dérivation BIP-39 → clé TON → adresse W5 → préparation
→ signature → BOC → diffusion → suivi → historique — fonctionne sur la chaîne.

**Vérifié dans le vrai Tonkeeper (26/09).** La phrase de test publique BIP-39 de
24 mots (`abandon` × 23 puis `art`), importée dans Tonkeeper, y affiche en W5
`UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw` — exactement l'adresse du
fichier de vecteurs. C'est la confirmation que ce document exigeait avant d'aller
plus loin. (Phrase connue de tous : ne jamais y envoyer de fonds.)

**Reste à faire, dans l'ordre.**

1. ~~**Lecture de la chaîne** (adaptateur)~~ — fait, sur TON Center (26/09) :
   `TonAdapterV2` lit l'état du compte (actif / non déployé / contrat), le solde,
   le seqno et la version du contrat ; prépare (rebond selon la règle de
   Tonkeeper, relue dans son code : `UQ…` ne rebondit jamais, sinon rebond ssi le
   destinataire est actif), signe (version retrouvée en comparant l'adresse
   d'envoi aux adresses de la clé : un signataire qui ne la possède pas ne signe
   rien ; échéance fixée À LA SIGNATURE), diffuse, et suit la transaction par son
   hachage NORMALISÉ (TEP-467) — calcul vérifié contre le `hash_norm` que TON
   Center indexe pour une transaction réelle. Le suivi lit les phases : avec
   `IGNORE_ERRORS`, un envoi sans fonds est SAUTÉ en silence et la phase se dit
   réussie ; `skipped_actions` le trahit. Toujours NON enregistré.
   Formes de réponse relevées en direct, pas supposées (`tonCenter.ts`).
   **Frais :** `estimateFee` du nœud + 0,001 TON de marge PRUDENTE par
   destinataire ; premier envoi : 0,01 TON fixe (l'estimation exigerait la clé
   publique, que la préparation n'a pas). Mesuré sur nos envois réels (réseau de
   test) : l'estimation du nœud tombait juste à 0,1 % près (526 870 nanotons
   réels) ; le déploiement a coûté 0,001 TON. La marge couvre ce qu'on ne peut pas
   mesurer sans envoyer sur le réseau principal, où l'acheminement coûte environ
   huit fois plus. Une première version de ce texte affirmait que le nœud
   « omet l'acheminement » : ce n'était pas établi. **Attention, vérifié :** `estimateFee` accepte aussi un
   corps au seqno FAUX — une estimation réussie ne prouve PAS qu'un message est
   correct. La justesse du message repose sur l'identité octet pour octet avec
   `@ton/ton` (l'adaptateur reproduit le transfert de référence de bout en bout),
   et sur un envoi réel sur le réseau de test.
   Au passage, `isValidTonAddress` refusait sur le réseau de test les écritures
   `UQ…`/`EQ…` et les adresses brutes : sur TON, les octets d'une adresse sont
   les mêmes sur les deux réseaux, seul le refus « adresse de test sur le réseau
   principal » protège quelque chose. C'est le seul qui reste.
   > **TRANCHÉ (26/09) :** TON Center SANS clé pour développer et tester (chaque
   > appareil a sa propre limite). En production, un proxy Cloudflare Worker —
   > la clé reste côté serveur, jamais dans un `EXPO_PUBLIC_` partagé par tous
   > les utilisateurs — devant **TonAPI** (tonapi.io), qui simplifie l'historique
   > et les jettons.
2. ~~Import des phrases TON~~ et ~~signataire depuis la phrase~~ — faits (ci-dessus).
3. **Question ouverte — comptes d'index > 0 sur TON.** Aujourd'hui, seul le
   compte 0 d'une phrase BIP-39 a TON : c'est la seule clé que Tonkeeper dérive
   pour elle, donc la seule qu'on garantit identique. Pour les comptes suivants,
   deux voies : les sous-portefeuilles W5 de la MÊME clé (numéro = index du
   compte), que Tonkeeper sait afficher ; ou `m/44'/607'/i'`, qu'aucun autre
   portefeuille ne montrerait. La première est la plus prometteuse, à vérifier
   dans Tonkeeper avant de choisir.
   > **Vérifié dans le code (26/09) :** une réponse externe affirmait que Tonkeeper
   > incrémente `m/44'/607'/i'` pour les comptes secondaires d'une phrase BIP-39.
   > C'est faux : dans tout `tonkeeper-web`, le SEUL chemin TON est la constante
   > `TON_DERIVATION_PATH = "m/44'/607'/0'"`, sans index. Les comptes multiples de
   > Tonkeeper passent par un autre mécanisme (« MAM », `TonKeychainRoot`).
   > Suivre cette réponse aurait donné aux comptes 2 et 3 des adresses que
   > Tonkeeper n'affiche jamais. Décision inchangée : TON sur le compte 0 seul.
4. ~~Enregistrer l'adaptateur et sa configuration~~ — **fait sur le réseau de
   test (26/09).** `TON_TESTNET` (`ton-testnet`, TON Center sans clé, explorateur
   Tonscan) est dans `ALL_CHAINS` ; TON est enregistré dans les deux registres —
   en v1 par `TonChainAdapter`, LECTURE SEULE (solde, historique : le portefeuille
   et l'historique lisent encore par `getAdapter`), l'envoi passant par la v2.
   Réseau principal : **activé le 27/09** (`TON`, explorateur Tonscan, cours CoinGecko
   `the-open-network`), une fois TonAPI en place et le chemin validé sur téléphone.

   Ce qu'il a fallu corriger pour que TON ne retombe nulle part sur l'EVM :
   - **Une seule fonction d'adresse, `lib/accountAddress.ts`.** Le ternaire
     `solana ? … : bitcoin ? … : evm` était recopié dans une douzaine d'écrans ;
     avec TON, chacun prenait l'adresse EVM sans rien dire — l'envoi serait parti
     de l'adresse EVM, le portefeuille aurait interrogé TON Center avec elle,
     Recevoir l'aurait affichée comme adresse TON. `switch` exhaustif, sans cas
     par défaut : une famille oubliée ne compile pas.
   - **Des types qui cachaient TON.** L'écran d'envoi FORÇAIT la famille
     (`as RecipientFamily`, figé à trois) : ses aiguillages retombaient sur
     Bitcoin sans erreur — la validation d'une adresse TON suivait la règle
     Bitcoin. `AddressFamily` ignorait TON : toute adresse TON du carnet de
     contacts était « invalide ». Élargis, et c'est le compilateur qui a trouvé
     les suivants.
   - La simulation d'envoi divisait tout ce qui n'est ni EVM ni Solana par 10^8
     (Bitcoin) : un montant TON serait apparu dix fois trop grand.
   - La réserve de frais valait 0 pour TON : « Max » aurait voulu envoyer tout le
     solde sans rien laisser aux frais.
   - Champ **commentaire** à l'envoi, dès que la chaîne déclare `memo` (TON, et
     Solana qui le gérait déjà) ; suivi après envoi par l'adaptateur v2.
   - Recevoir : textes TON (et plus ceux de Bitcoin, qui tombaient par défaut).
   - Réseaux : l'ancien panneau « TON pas encore disponible » était devenu faux ;
     remplacé par « TON — réseau de test », avec un bouton pour afficher les
     réseaux de test.

   Vérifié : bundles Android et web construits avec TON actif (le module de
   substitution de `@ton/crypto` enfin sollicité par Metro), aucune erreur au
   démarrage de l'export web — le registre y instancie l'adaptateur TON.
   **PIÈGE :** le registre v1 (`chains/registry.ts`) instancie un adaptateur pour
   CHAQUE configuration de `ALL_CHAINS` au chargement du module, et lève sur une
   famille inconnue. Ajouter une configuration TON sans traiter `'ton'` dans
   `createAdapter` fait planter l'app AU DÉMARRAGE. (`toAccount` et
   `setActiveWallet` lisent déjà la configuration sans adaptateur.)

---

## 13. TonAPI, par le proxy Kalyx (27/09)

`ton-proxy/` (Worker Cloudflare, déployé) garde la clé TonAPI et n'ouvre que dix
routes. L'app l'utilise en fournisseur PRINCIPAL (`tonApi.ts`, `tonProxy.ts`),
et chaque lecture retombe sur TON Center si TonAPI échoue.

Ce qu'il apporte, vérifié en direct à travers le Worker :
- **Frais exacts** par émulation (`event.extra`, signature à zéro acceptée) :
  0,000372 TON relevés sur un vrai portefeuille, au lieu de l'estimation
  prudente. Le premier envoi d'un compte non déployé reste estimé (l'émulation
  exigerait l'état initial, donc la clé publique).
- **`memo_required`** : l'avertissement `MEMO_REQUIRED` (bloquant) quand une
  plateforme exige un commentaire et qu'il est vide.
- **Historique en actions.** Deux pièges relevés sur un vrai compte : un dépôt
  rebondissant reçu avant le déploiement est RENVOYÉ automatiquement — ce n'est
  pas un envoi, il est affiché en reçu net marqué `BOUNCE` ; et `ext_msg_hash`
  est exactement le hachage normalisé qu'un envoi rend, donc le suivi retrouve
  la transaction directement.
- **Solde** : un NOMBRE JSON chez TonAPI — lu dans le texte brut, sinon arrondi
  au-delà de 2^53 nanotons.

Réseau principal activé le 27/09.

## 14. Jettons (27/09)

Lecture, envoi et historique des jettons TEP-74 (`tonJettons.ts`, `TonAdapterV2`).

- **Lecture** : `/v2/accounts/{a}/jettons?currencies=…` donne, pour chaque
  jeton, NOTRE portefeuille de jeton (plus besoin de `get_wallet_address`), le
  prix dans la devise de l'utilisateur et un statut de vérification.
- **Le symbole ne prouve rien.** Relevé sur le compte du maître USD₮ : un faux
  « USD₮ » en liste noire à côté du vrai, et un « Tethe USD / USDT-GARN » non
  vérifié reçu sans rien demander. Règle : `blacklist` écarté partout ; `none`
  masqué, sans valeur, jamais montré en réception dans l'historique ; seul
  `whitelist` compte dans le total.
- **Transfert** : `transfer#0f8a7ea5` envoyé à notre portefeuille de jeton, avec
  0,05 TON pour le gaz (valeur de Tonkeeper, l'excédent revient par
  `response_destination`) et `forward_ton_amount = 1` nanoton pour que le
  destinataire reçoive la notification — et le commentaire, indispensable aux
  dépôts sur plateforme. Le corps est comparé AU BIT PRÈS à 9 transferts USD₮
  réels (`ton-jetton-transfer-vectors.json`).
- **Preuve sur le réseau principal** : émulation par TonAPI d'un transfert de
  1 unité d'USD₮ préparé par l'adaptateur depuis un vrai portefeuille W5 —
  `JettonTransfer ok`, 0,0022 TON de frais nets.
- **Commentaire exigé** : `MEMO_REQUIRED` était calculé mais jamais montré.
  `sendDraft` bloque désormais l'envoi (erreur traduite `errMemoRequired`),
  pour TON comme pour les jettons.
- **Images** : TonAPI sert du WebP signé ; converties en PNG par `wsrv.nl`.
- Webapp : pas d'envoi de jetton (la signature par téléphone ne couvre pas TON).

Frais du jetton : l'écran affiche le coût émulé (envoi à soi-même) et exige à
part les 0,05 TON joints.

## 15. NFT et noms `.ton` (27/09)

- **NFT** : `/v2/accounts/{a}/nfts` (route ajoutée au proxy, cache 60 s). Sur le
  compte relevé, la MOITIÉ des NFT sont des arnaques (« 1,000,000 NOT Voucher »,
  « 6,515 USDT Bonus »…) : écartés par `trust: blacklist` ou par l'absence de
  collection. Un domaine `.ton` est toujours gardé (collection TON DNS). Lien
  explorateur : `tonscan.org/nft/{adresse}`.
- **Noms** : `/v2/dns/{nom}/resolve` (route ajoutée, cache 60 s, noms en
  minuscules seulement). Envoyer accepte « kalyx.ton » comme ENS sur EVM ;
  l'adresse est rendue conviviale NON rebondissante.
- **Le proxy doit être redéployé** pour ces deux routes (`npx wrangler deploy`
  dans `ton-proxy/`) : sans elles, les NFT TON restent vides et un nom `.ton`
  est « introuvable », sans rien casser d'autre.

## 16. TON Connect v2 (27/09)

Connexion aux dApps TON (STON.fi, DeDust, mini-apps Telegram), en trois couches.

- **Protocole** (`src/domain/tonconnect/`), chaque pièce vérifiée contre sa
  référence :
  - `sessionCrypto` : crypto_box reconstruit avec @noble — identique octet
    pour octet à tweetnacl (`nacl-box-vectors.json`) ;
  - `connectLink` : liens universels, `tc://`, Telegram (réencodage du SDK
    inversé) ; le pont de réponse est celui du wallet dont la dApp a affiché
    le QR (liste officielle, `wallets-bridges.json`) ; manifeste refusé s'il
    n'est pas hébergé sur le domaine qu'il déclare ;
  - `tonProof` : mêmes octets signés que Tonkeeper ; `walletStateInit` qui
    redonne l'adresse ;
  - `requests` : `sendTransaction` contrôlé (échéance, réseau, expéditeur,
    adresses conviviales, ≤ 4 messages, contenu lisible) ;
  - `sse` : lecteur de flux, calé sur le vrai pont de TonAPI.
- **App** (`lib/tonconnect/`) : pont SSE par XMLHttpRequest (pas
  d'EventSource en React Native), une connexion par pont ; sessions dans le
  stockage chiffré ; file de demandes. Test de bout en bout contre une fausse
  dApp (`store.test.ts`).
- **Écrans** (`ui/TonConnectHost.tsx`) : la transaction est montrée par ce
  qu'elle FAIT — émulation TonAPI : TON, jettons, NFT qui sortent, vidage du
  solde, échec prévisible (bouton désactivé). Code exigé pour tout.
- **Entrées** : scanner le QR TON Connect d'une dApp, ou coller le lien dans
  l'écran WalletConnect, qui liste aussi les apps TON connectées.

Pas encore : `signData`, les éléments structurés (`items`), le lien profond
`tc://` ouvert depuis une autre app (schéma natif : nouvel APK), et
l'inscription de Kalyx dans la liste officielle des wallets (pour apparaître
dans le sélecteur des dApps).

Reste : staking, commentaires chiffrés, changement de version de
portefeuille, envoi de NFT.

## 17. Envoi de NFT et staking Tonstakers (27/09)

- **NFT** : `transfer#5fcc3d14` (TEP-62) à l'élément NFT, 0,05 TON de gaz ;
  corps identique au bit près à 13 transferts réels. Destinataire : adresse
  ou nom .ton. Émulé sur le réseau principal (vrai domaine, succès).
- **Staking liquide Tonstakers** (SDK officiel `tonstakers-sdk`) :
  - dépôt au pool `EQCkWxfy…-vqR` : `stake#47d54391 query_id partner`, montant
    + 1 TON de réserve (rendue) ; code partenaire 0 ;
  - retrait : `burn#595f07bc` à notre portefeuille tsTON, 1,05 TON joints ;
    modes standard / instantané (fill_or_kill) / meilleur taux
    (wait_till_round_end) ;
  - 12 dépôts et 9 retraits réels reproduits au bit près
    (`tonstakers-vectors.json`) ; dépôt de 1 TON et retrait de tsTON émulés
    sur le réseau principal avec succès (0,0136 et 0,0018 TON de frais nets) ;
  - APY, minimum et contrat tsTON : `/v2/staking/pool/{pool}` ; valeur du
    tsTON : `/v2/rates?tokens=<maître>&currencies=ton` (1 tsTON ≈ 1,16 TON le
    27/09). **Deux routes ajoutées au proxy : à redéployer**, sinon la carte
    Staking reste masquée.


## 18. Pont JS TON Connect dans le navigateur intégré (28/09)

Comme Tonkeeper ou MyTonWallet, le navigateur de Kalyx injecte dans chaque page
`window.kalyx.tonconnect` (spécification « JS bridge » de TON Connect). Le SDK du
site le découvre en parcourant `window` (il exige `walletInfo` complet : `name`,
`app_name`, `image`, `about_url`, `platforms`) et, voyant `isWalletBrowser`,
demande la connexion directement au wallet : ni QR, ni choix de wallet.

- `src/domain/tonconnect/jsBridge.ts` : script injecté, lecture des messages,
  validation, règle page ↔ manifeste ;
- `lib/tonconnect/store.ts` : transport `js` à côté du pont HTTP. Mêmes fenêtres
  d'approbation, même `ton_proof`, même simulation ; sessions `js:<hôte>`
  persistées, donc `restoreConnection` reconnecte la page sans rien redemander ;
- `app/(tabs)/browser.tsx` : injection et routage des messages ; une réponse
  n'est exécutée que si la page ouverte est toujours celle qui a demandé.

Règle ajoutée par rapport au pont HTTP : la page doit appartenir au domaine que
le manifeste déclare (même hôte ou sous-domaine). Le pont HTTP ne voit que le
manifeste ; ici on voit la vraie page, et sans cette règle un site piégé
obtiendrait une preuve `ton_proof` valable chez STON.fi.

Test : `lib/tonconnect/jsBridge.test.ts` (découverte par le SDK, connexion avec
preuve vérifiée, reprise, transaction, refus d'une page usurpatrice, déconnexion).
