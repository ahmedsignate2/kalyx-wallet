# Couverture par chaîne — EVM, Bitcoin, Solana

**Pourquoi ce document.** À la question « est-ce complet ? », j'ai répondu trois
fois « oui, sauf… » puis trouvé d'autres trous à chaque nouvelle recherche. Le
problème n'était pas les trous, c'était la méthode : j'auditais au hasard, donc
je répondais au hasard. Ce document énumère la SURFACE ENTIÈRE, capacité par
capacité et chaîne par chaîne. Une case vide est un manque connu, pas un oubli
qui ressortira au prochain examen.

Il se met à jour avec le code. Une capacité ajoutée sans sa ligne ici est un
regard en moins la prochaine fois qu'on posera la question.

Légende :
- **OK** — implémenté et couvert par des tests.
- **OK (non testé)** — implémenté, mais aucun test ne le couvre.
- **Absent (choix)** — délibérément absent, avec la raison.
- **MANQUE** — trou réel, non traité.
- **n/a** — la notion n'existe pas sur cette chaîne.

---

## 1. Comptes et lecture

| Capacité | EVM | Bitcoin | Solana |
|---|---|---|---|
| Dérivation HD | OK (BIP-44) | OK (BIP-84, P2WPKH) | OK (SLIP-0010 ed25519) |
| Solde natif | OK | OK | OK |
| Soldes de jetons | OK (Alchemy + liste connue) | n/a | OK (les DEUX programmes, Token-2022 compris) |
| Historique natif | OK | OK | OK |
| Historique de jetons | OK | n/a | OK (`pre/postTokenBalances`, échanges étiquetés) |
| NFT | OK (Alchemy) | Absent (choix) — les ordinaux demandent une indexation séparée | MANQUE |
| Validation d'adresse | OK (EIP-55, casse mixte rejetée) | OK (P2PKH, P2SH, P2WPKH, P2WSH, P2TR) | OK (32 octets + point de courbe) |

## 2. Envoi

| Capacité | EVM | Bitcoin | Solana |
|---|---|---|---|
| Envoi natif | OK (1559 **et** legacy) | OK (vers les 4 formats) | OK |
| Envoi de jetons | OK (ERC-20) | n/a | OK (SPL **et** Token-2022) |
| Limite de gaz estimée | OK | n/a (modèle UTXO) | Absent (choix) — budget fixe, ajusté au plus près |
| Paliers de frais | OK (3) | OK (3) | OK (priorité au centile 75) |
| Frais prélevés par le jeton | n/a | n/a | OK (extension Token-2022, affichés) |
| Seuil de poussière | n/a | OK (par type de sortie) | n/a |
| Réserve pour « tout envoyer » | OK | OK | OK |
| Avertissement destinataire | OK (contrat, empoisonnement, jamais utilisée) | OK (empoisonnement) | OK (PDA / compte de jeton) |
| Simulation avant signature | OK | **MANQUE** — pas d'équivalent UTXO simple | OK (Helius, si clé présente) |

## 3. Après l'envoi

| Capacité | EVM | Bitcoin | Solana |
|---|---|---|---|
| Suivi de confirmation | OK | OK | OK (`confirmSignature`, expiration détectée) |
| Accélérer | OK (même nonce, +20 %) | OK (RBF, BIP-125) | n/a — une tx non incluse expire, rien n'est débité |
| Annuler | OK (nonce vers soi) | OK (RBF vers soi-même) — *disponible sur l'adapter v2* | n/a |
| Distinguer « échouée » d'« expirée » | OK | OK | OK (`TX_FAILED` / `TX_EXPIRED`) |

## 4. dApps et signature

| Capacité | EVM | Bitcoin | Solana |
|---|---|---|---|
| Signature de message | OK (`personal_sign`, `eth_sign`) | OK (BIP-137 **et** BIP-322) | OK (`solana_signMessage`) |
| Données typées | OK (`eth_signTypedData_v4`) | n/a | n/a |
| Signature de transaction | OK (`eth_sendTransaction`) | OK (PSBT) | OK (simple et par lot) |
| Changement de réseau | OK (`wallet_switchEthereumChain`, `wallet_addEthereumChain`) | n/a | n/a |
| Navigateur dApps intégré | OK | Absent (choix) | OK |

## 5. Transverse

| Capacité | EVM | Bitcoin | Solana |
|---|---|---|---|
| URI de paiement | OK (EIP-681) | OK (BIP-21, `req-` respecté) | OK (Solana Pay complet : `reference`, `label`, `message`, `memo`, requêtes de transaction) |
| Lien profond + lien universel | OK | OK | OK |
| Réseaux personnalisés | OK | Absent (choix) — cf. §23, les adresses testnet sont refusées | OK (RPC personnel) |
| Échange (swap) | OK | **MANQUE** — aucun agrégateur UTXO branché | OK |
| Rendement (earn) | OK | Absent (choix) | Partiel |

---

## Ce qui reste, classé

**Manques réels, par ordre d'impact :**

1. **Échange Bitcoin.** Aucun agrégateur UTXO n'est branché. C'est une intégration
   externe, pas un trou de notre architecture.
3. **NFT Solana.** Les jetons sont lus, pas les NFT.
4. **Simulation Bitcoin.** Il n'existe pas d'équivalent simple à `eth_call` sur un
   modèle UTXO ; les contrôles (poussière, solde, frais, format d'adresse) sont
   faits avant signature, ce qui couvre l'essentiel du risque.

**Résolu depuis :** Solana Pay était incomplet au point d'être inutilisable en
commerce. `reference` était purement IGNORÉ — c'est pourtant le seul moyen pour
un marchand de retrouver la transaction parmi celles qui arrivent sur son
adresse, donc son terminal restait sur « en attente » alors que les fonds
étaient partis. Et la spec autorise sa répétition, que le parseur de requête
écrasait. `label`, `message` et `memo` étaient ignorés côté Solana alors qu'ils
étaient lus pour Bitcoin. Les requêtes de TRANSACTION (`solana:https://…`),
c'est-à-dire la moitié de la spec, donnaient « QR non reconnu ».

**Résolu depuis :** la NOTIFICATION de confirmation sur Bitcoin et Solana.
`lib/txWatch` ne suivait que l'EVM, parce que la v1 n'avait de `waitForTx` que
là : un envoi Bitcoin ou Solana n'était jamais confirmé, l'utilisateur voyait
« envoyé » et plus rien ensuite, quoi qu'il arrive à sa transaction. La v2 rend
`waitForTx` obligatoire sur les trois et distingue les issues — confirmée,
échouée (incluse puis rejetée, frais payés), abandonnée (jamais incluse, fonds
intacts).

**Résolu depuis :** l'annulation Bitcoin. Elle existe sur `BitcoinAdapterV2` —
même mécanisme RBF que l'accélération, mais en se renvoyant les fonds à soi-même,
ce qui dépense les mêmes entrées et rend l'originale caduque. Elle sera visible
dans l'interface au branchement de la v2.

**Ce qui n'est PAS un manque, et qu'il faut arrêter de rechercher :**

- L'absence de NFT Bitcoin (ordinaux) : indexation séparée, hors périmètre.
- L'absence d'annulation Solana : une transaction non incluse expire d'elle-même
  et ne débite rien. Annuler n'a pas de sens.
- L'absence de limite de gaz estimée sur Solana : le budget d'unités de calcul
  est fixe et ajusté au plus près, parce que les frais de priorité se paient sur
  la limite DEMANDÉE et non consommée.

**Limite qu'aucun test ne lèvera :** rien de tout cela n'a été exécuté contre un
réseau réel. Les tests bouchonnent le réseau. Un envoi BTC réel de bout en bout,
sur un petit montant, vaut plus que cinquante tests de plus.

---

## Limites connues, assumées

**La clé privée EVM transite par une chaîne de caractères.** `ethers` expose sa
signature via `new Wallet(privateKeyHex)`, ce qui oblige à reconstruire une
chaîne hexadécimale à partir des octets. Une chaîne JavaScript est IMMUABLE :
`wipeSigner` remet à zéro le `Uint8Array` d'origine, mais la copie hexadécimale
reste en mémoire jusqu'au passage du ramasse-miettes.

C'est une limite d'`ethers`, pas du design — et elle existait déjà avant la v2,
où la clé circulait en hexadécimal de bout en bout. La v2 réduit la fenêtre :
la chaîne n'est fabriquée qu'au moment de signer, et pas transportée.

La contourner demanderait de signer à la main avec `@noble/curves` plutôt que
d'utiliser `Wallet` — donc de réimplémenter l'encodage RLP et la sérialisation
des transactions de type 0 et 2. Du code de signature écrit maison, c'est-à-dire
exactement l'endroit où une erreur coûte le plus cher, pour fermer une fenêtre
qui se mesure en millisecondes sur un appareil déjà déverrouillé. **Non retenu**
pour l'instant ; à reconsidérer si le reste de la surface se resserre.

Solana, Bitcoin, et demain TON, ne sont pas concernés : `@noble/curves` et
`@scure/btc-signer` signent directement des octets. Leurs chemins de signature —
envoi, message, PSBT, transaction dApp — passent tous par `withSigner`, donc la
clé est effacée après usage, succès ou échec.

**Deux chemins EVM restent hors du cycle d'effacement** pour la même raison :
`signMessage` (personal_sign) et `signTypedData`. Ils reçoivent une clé
hexadécimale de `revealEvmSigningKey` et la donnent à `ethers`. Les router par
la v2 n'y changerait rien — ethers refabriquerait la chaîne — et
`signMessage` y perdrait une nuance qui compte : `personal_sign` sur une
donnée hexadécimale doit signer les OCTETS DÉCODÉS, pas le texte de
l'hexadécimal, distinction que la signature v2 (`message: string`) ne porte
pas. Les migrer pour le seul principe casserait des signatures que les dApps
vérifient. **Laissés sur la v1, sciemment.**

---

## État de la migration vers `ChainAdapterV2`

L'interface v1 était modelée sur l'EVM : Bitcoin et Solana y levaient
`NOT_SUPPORTED` sur trois méthodes et passaient par des méthodes maison, ce qui
obligeait `walletStore` et les écrans à aiguiller sur `instanceof`. La v2 pose
un pipeline typé — préparer, signer, diffuser, confirmer — avec une charge utile
opaque par chaîne et des capacités déclarées.

**Migré, et appelé par l'app :**

| Chemin | État |
|---|---|
| Envoi de la pièce native (3 chaînes) | v2 — un seul `sendDraft` |
| Envoi de jeton (ERC-20, SPL, Token-2022) | v2 — même chemin |
| Accélération / annulation | v2, gouvernées par les capacités |
| Suivi de confirmation | v2 — les trois chaînes, issues distinguées |
| Paliers de frais à l'écran | v2 — `quoteFees`, vraie sélection UTXO côté BTC |
| Signature de message Bitcoin (BIP-137 / BIP-322) | v2 |
| Signature Solana (transaction, message) | v2 pour la dérivation et l'effacement |
| Signature PSBT Bitcoin | v2 pour la dérivation et l'effacement |

**Resté sur la v1, avec sa raison :**

| Chemin | Pourquoi |
|---|---|
| Échange (swap) | Opération propre à chaque chaîne, absente de l'interface v2 |
| Transaction brute pour dApp (`eth_sendTransaction`) | Notion purement EVM |
| Autorisations ERC-20, rendement, `isContract` | Notions purement EVM |
| `signMessage` (personal_sign), `signTypedData` | Clé hexadécimale imposée par ethers ; et `personal_sign` sur une donnée hexadécimale doit signer les octets DÉCODÉS, nuance que la signature v2 ne porte pas |

Ces `instanceof` restants ne sont PAS de l'aiguillage oublié : ce sont des
opérations qui n'existent que sur une chaîne. Inventer des capacités génériques
pour les couvrir rendrait l'interface plus vague, pas plus juste.

**Ce que la migration a fait apparaître, et qui valait le détour :**

1. `BroadcastOutcome.opaque` — Solana raisonne en hauteur de bloc, pas en
   horloge ; sans ce repère l'attente se terminait par un simple délai.
2. `PendingRef.opaque` — un remplacement Bitcoin doit reprendre les mêmes
   entrées, or les UTXO dépensés sont irrécupérables après coup.

Les deux ont été trouvés en migrant la deuxième et la troisième chaîne. Migrer
les trois d'un coup les aurait fait découvrir après coup, sur trois adapters
déjà écrits.

**Ce qu'aucun test ne garantit :** le chemin d'envoi de l'app est passé d'un code
éprouvé en production à un code neuf, vérifié uniquement contre un réseau
bouchonné. Un envoi réel par chaîne, sur un montant minuscule, reste nécessaire
avant de considérer la migration terminée.
