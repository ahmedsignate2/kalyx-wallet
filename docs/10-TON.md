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

> **TRANCHÉ : (a), la dérivation native.** Implémentée dans
> `src/domain/chains/ton/tonMnemonic.ts`, avec l'algorithme écrit constante par
> constante — sels, itérations, décalages d'octets — parce qu'aucune de ces
> valeurs n'est devinable et qu'une seule erreur suffit à dériver la clé d'une
> autre adresse.
>
> **Reste à confirmer avant d'activer TON :** l'implémentation suit l'algorithme
> de `ton-crypto` mais n'est PAS validée contre un vecteur réel. Les tests
> couvrent le déterminisme, les longueurs, l'effet du mot de passe et de l'ordre
> des mots — pas l'interopérabilité. Il faut comparer une adresse dérivée ici à
> celle que Tonkeeper affiche pour la même phrase. Une dérivation fausse ne plante
> pas : elle montre un portefeuille vide, ce qui est le pire des deux.

---

## 2. L'adresse n'est pas dérivée de la clé

Sur EVM, Bitcoin et Solana, l'adresse se calcule depuis la clé publique. **Sur
TON, non.** Une adresse TON est le hachage de l'état initial d'un contrat :
`hash(code, data)`. Le `code` est celui du contrat de portefeuille choisi, le
`data` contient la clé publique et un identifiant de sous-portefeuille.

Conséquence directe : **la même clé donne des adresses différentes selon la
version de contrat.** Les versions en circulation sont v3R2, v4R2 et W5 (v5).

**À trancher :** quelle version Kalyx génère. W5 est la plus récente (frais
délégués, opérations groupées) ; v4R2 reste la plus répandue. Et il faudra
probablement savoir LIRE les deux, même si l'on n'en génère qu'une, pour qu'une
phrase importée retrouve ses fonds là où ils sont.

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

L'écosystème officiel est `@ton/core`, `@ton/crypto` et `@ton/ton`. Deux points
à vérifier AVANT de les ajouter :

1. **Le format des modules.** `@scure/btc-signer` est en ESM pur, ce qui a
   obligé à ajouter une transformation dans `jest.config.js`. Si les paquets TON
   le sont aussi, il faudra les ajouter au même motif — qui est ANCRÉ, et dont
   l'ancrage est précisément ce qui manquait la première fois.
2. **L'empreinte.** Ajouter une dépendance modifie `package.json`, donc
   l'empreinte, donc coupe les OTA vers les APK déjà installés. À grouper avec
   un build, jamais entre deux mises à jour.

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

**Fait, pur et testé.**

- `tonAddress.ts` — analyse, écriture et validation des adresses. Les deux
  écritures (`EQ…` rebondissante, `UQ…` non rebondissante) sont reconnues et le
  drapeau est RENDU au lieu d'être jeté : c'est ce qui permettra à `prepareSend`
  de comparer la forme demandée à l'état réel du compte. Le drapeau testnet est
  refusé sur le réseau principal, comme pour Bitcoin. Le CRC est validé contre le
  vecteur canonique du CRC-16/XMODEM (`123456789` → `0x31C3`), et le workchain est
  lu comme un entier SIGNÉ — la masterchain vaut −1, écrit `0xFF`, et le lire non
  signé ferait refuser une adresse valide. Quatorze tests.
- `tonMnemonic.ts` — dérivation native phrase → graine ed25519, contrôle de
  validité TON (sans rapport avec BIP-39 : pas de somme de contrôle sur les mots)
  et détection d'une phrase protégée par mot de passe. Onze tests.

**Reste à faire, dans l'ordre.**

1. Confirmer la dérivation contre une adresse Tonkeeper réelle. Rien ne doit être
   exposé dans l'app avant.
2. Choisir la version du contrat de portefeuille (v4R2 ou W5) et embarquer son
   code, sans quoi l'adresse — qui est `hash(code, data)` et non un dérivé de la
   clé — ne peut pas être calculée.
3. Construire le message externe (BOC) et le `StateInit` du premier envoi, qui
   déploie le compte aux frais de l'expéditeur.
4. Brancher `deriveSigner` sur la PHRASE et non sur la graine BIP-39 — TON est la
   seule chaîne dans ce cas, et c'est le seul endroit du magasin à toucher.
5. Enregistrer l'adaptateur et sa configuration, en dernier : un adaptateur
   enregistré à moitié est plus dangereux qu'un adaptateur absent.
