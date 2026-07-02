# 7. Différenciation — « pourquoi quitter MetaMask »

Objectif : ne pas faire « MetaMask avec un autre logo », mais apporter ce que les wallets classiques n'ont pas, **sans jamais casser le modèle non-custodial**. Chaque idée est classée par compatibilité avec ce modèle, puis placée dans la roadmap.

## 7.1 Le classement (le plus important)

### ✅ Catégorie A — 100 % client, compatibles non-custodial
Aucun serveur ne voit de clé, aucune contrainte réglementaire. **C'est là qu'on gagne.**

| Fonction | Ce que ça apporte | Comment |
|----------|-------------------|---------|
| **Patrimoine total temps réel** | Vue « compte bancaire » agrégée multi-chain | Somme des soldes × prix (CoinGecko). Déjà en phase 2. |
| **Détection d'arnaque avant signature** ⭐ | Le vrai différenciateur. Avertir AVANT de signer. | Simulation de transaction + décodage de l'intention (que va-t-il se passer ?), listes de contrats malveillants, alerte sur approbations `approve`/`setApprovalForAll` illimitées. |
| **Vérification de contrats suspects** | Prévenir les scams token/approval | Réputation de contrat (bases publiques), détection d'approvals dangereux, honeypots. |
| **Multi-wallets en un clic** | Créer/gérer plusieurs comptes facilement | Dérivation d'index HD supplémentaires (`.../0/1`, `.../0/2`…) sur la même seed. |
| **Mode débutant / expert** | Simplicité pour les néophytes, contrôle pour les pros | Toggle qui masque/affiche gas avancé, nonce, hex data, réseaux de test. |
| **Wallet caché (2e PIN)** ⭐ | Déni plausible, façon passphrase Ledger | Une seed « leurre » sous le PIN principal, une seed cachée sous un 2e PIN. Chiffrement séparé. |
| **Alertes de prix** | Rétention, engagement | Seuils définis par l'utilisateur ; notifications locales (ou push via un service ne voyant que des symboles, jamais de clé). |
| **UI ultra-fluide façon Revolut** | La première impression | Design system maison + Reanimated. Transversal. |

### ⚠️ Catégorie B — possibles via prestataire tiers, restent non-custodial
Tu ne prends jamais la clé de l'utilisateur, mais tu ajoutes une **dépendance externe et du risque smart-contract**. À faire proprement, tard.

| Fonction | Réalité |
|----------|---------|
| **Swap (même chaîne + cross-chain)** | Via agrégateurs : 0x / 1inch / LiFi / Socket (EVM), Jupiter (Solana). L'utilisateur signe lui-même. Risque : dépendance API + contrats des agrégateurs + slippage/MEV. |
| **Staking intégré** | Via contrats de *liquid staking* (ex. Lido) ou staking natif. Non-custodial mais expose au **risque de smart contract** — à présenter avec des avertissements clairs. |

### 🚨 Catégorie C — casse le modèle non-custodial / très régulé
Faisable **uniquement via un partenaire régulé**, avec **KYC** et souvent une **licence**. Ce n'est plus « une app », c'est un produit financier régulé. À isoler tout à la fin, en optionnel, et à ne surtout pas mélanger avec le cœur non-custodial.

| Fonction | Pourquoi c'est un autre monde |
|----------|-------------------------------|
| **Achat / vente fiat in-app** | Nécessite un on/off-ramp régulé (MoonPay, Ramp, Transak). KYC obligatoire, données perso, conformité AML. Le prestataire est custodial de son côté. |
| **Cartes virtuelles** | Nécessite un émetteur régulé + licence + KYC + conformité. Chantier juridique majeur, pas juste technique. |

> **Règle :** les catégories B et C n'entrent **jamais** en contact avec la seed/clé. Elles vivent dans des modules isolés, activables/désactivables, et n'existent qu'une fois le cœur (A) solide et audité.

## 7.2 Où ça s'insère dans la roadmap (mise à jour)

- **Phase 2** : patrimoine total temps réel (déjà prévu).
- **Phase 2/3** : ⭐ détection d'arnaque avant signature + vérif de contrats — à prioriser, c'est le différenciateur n°1.
- **Phase 5** : multi-wallets en un clic, mode débutant/expert, **wallet caché (2e PIN)**, alertes de prix.
- **Phase 6 (nouvelle, « écosystème »)** : swap, staking (catégorie B).
- **Phase 7 (nouvelle, « régulé », optionnelle)** : achat/vente fiat, cartes (catégorie C) — seulement avec partenaire régulé et cadrage juridique.

## 7.3 Le vrai avantage concurrentiel

Si je devais parier sur **une seule** chose qui fait quitter MetaMask, ce serait la **détection d'arnaque avant signature** : montrer en clair « cette transaction va vider ton wallet » *avant* le tap. C'est là que MetaMask est faible et que les utilisateurs se font vider. Combiné à l'**UX Revolut**, c'est un positionnement fort : *« le wallet qui te protège et que tu comprends »*.

## 7.4 Note technologie : React Native vs Flutter

- On **reste sur React Native/Expo** pour ce projet. Raison : l'écosystème crypto JS est **mûr et audité** (`@noble`/`@scure`, `ethers`, `@solana/web3.js`, `@scure/btc-signer`). En Dart/Flutter, l'outillage crypto multi-chain est plus pauvre → plus de code custom = plus de risque sur un wallet.
- Flutter a un rendu superbe et de bonnes perfs, beaucoup de fintechs l'utilisent — **mais** leurs fintechs ne signent pas des transactions blockchain côté client.
- **Conclusion :** on garde Flutter en « option à réévaluer » plus tard si le besoin UI devient un facteur limitant. Ce n'est pas une décision à prendre maintenant, et ça ne doit pas retarder le MVP.
