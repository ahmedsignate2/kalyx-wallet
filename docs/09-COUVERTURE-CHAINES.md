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
| Suivi de confirmation | OK | OK (via l'historique) | OK (`confirmSignature`, expiration détectée) |
| Accélérer | OK (même nonce, +20 %) | OK (RBF, BIP-125) | n/a — une tx non incluse expire, rien n'est débité |
| Annuler | OK (nonce vers soi) | **MANQUE** — techniquement possible en RBF vers soi-même | n/a |
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
| URI de paiement | OK (EIP-681) | OK (BIP-21, `req-` respecté) | OK (Solana Pay) |
| Lien profond + lien universel | OK | OK | OK |
| Réseaux personnalisés | OK | Absent (choix) — cf. §23, les adresses testnet sont refusées | OK (RPC personnel) |
| Échange (swap) | OK | **MANQUE** — aucun agrégateur UTXO branché | OK |
| Rendement (earn) | OK | Absent (choix) | Partiel |

---

## Ce qui reste, classé

**Manques réels, par ordre d'impact :**

1. **Annulation Bitcoin.** L'accélération existe ; annuler serait le même
   mécanisme RBF, mais en se renvoyant les fonds à soi-même. Le socle est déjà
   là (`bumpBitcoinFee`), il manque le chemin « destinataire = moi ».
2. **Échange Bitcoin.** Aucun agrégateur UTXO n'est branché. C'est une intégration
   externe, pas un trou de notre architecture.
3. **NFT Solana.** Les jetons sont lus, pas les NFT.
4. **Simulation Bitcoin.** Il n'existe pas d'équivalent simple à `eth_call` sur un
   modèle UTXO ; les contrôles (poussière, solde, frais, format d'adresse) sont
   faits avant signature, ce qui couvre l'essentiel du risque.

**Ce qui n'est PAS un manque, et qu'il faut arrêter de rechercher :**

- L'absence de NFT Bitcoin (ordinaux) : indexation séparée, hors périmètre.
- L'absence d'annulation Solana : une transaction non incluse expire d'elle-même
  et ne débite rien. Annuler n'a pas de sens.
- L'absence de limite de gaz estimée sur Solana : le budget d'unités de calcul
  est fixe et ajusté au plus près, parce que les frais de priorité se paient sur
  la limite DEMANDÉE et non consommée.

**Limite qu'aucun test ne lèvera :** rien de tout cela n'a été exécuté contre un
réseau réel. Les 748 tests bouchonnent le réseau. Un envoi BTC réel de bout en
bout, sur un petit montant, vaut plus que cinquante tests de plus.
