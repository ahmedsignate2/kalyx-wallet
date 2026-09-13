# Kit de listing store — Kalyx Wallet

Tout le nécessaire pour publier Kalyx sur le Google Play Store (et App Store).
Les assets graphiques sont dans `assets/store/`.

---

## 1. Assets graphiques (prêts)

| Asset | Fichier | Dimensions | Statut |
|---|---|---|---|
| Icône de l'app (build) | `assets/icon.png` | 1024×1024 | ✅ |
| Icône haute-résolution (Play Console) | `assets/store/play-icon-512.png` | 512×512 | ✅ |
| Adaptive icon Android (avant-plan) | `assets/adaptive-icon.png` | 1024×1024 | ✅ |
| Adaptive icon Android (fond) | `assets/adaptive-bg.png` | 1024×1024 | ✅ |
| Splash | `assets/splash.png` | 1024×1024 | ✅ |
| **Feature graphic** (bannière Play Store) | `assets/store/feature-graphic.png` | **1024×500** | ✅ |
| Captures d'écran téléphone | à capturer (voir §4) | 1080×1920+ | ⬜ |

> Régénérer les assets store : `node scripts/gen-store-assets.js` (voir §5).

---

## 2. Textes de la fiche (FR)

**Nom de l'app :** `Kalyx — Wallet Crypto`

**Description courte** (80 caractères max) :
> Wallet crypto non-custodial : envoie, swap, dApps, NFT. Tes clés, tes cryptos.

**Description complète :**

> **Kalyx, ton portefeuille crypto non-custodial, simple et premium.**
>
> Tes clés privées restent sur ton téléphone, chiffrées — jamais sur nos serveurs. Tu gardes le contrôle total de tes fonds.
>
> **✦ Multi-chaînes**
> 60+ réseaux : Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche… + Bitcoin et Solana. Une seule app pour tout.
>
> **✦ Envoie & reçois**
> Transferts natifs et tokens (ERC-20, SPL), noms ENS (`vitalik.eth`), QR, carnet d'adresses, contrôle du solde avant l'envoi.
>
> **✦ Swap & Bridge intégrés**
> Échange tes tokens au meilleur prix et passe d'une chaîne à l'autre, sans quitter l'app.
>
> **✦ Navigateur dApps**
> Uniswap, OpenSea, Aave… directement dans Kalyx, avec WalletConnect et des signatures toujours claires (tu vois ce que tu signes).
>
> **✦ NFT**
> Ta galerie ERC-721 / ERC-1155, métadonnées et collections.
>
> **✦ Sécurité d'abord**
> Déverrouillage biométrique, code PIN, verrouillage automatique, écran de garde, sauvegarde chiffrée de ta phrase, simulation des transactions pour éviter les arnaques (approbations illimitées, drain de NFT).
>
> **✦ Suivi & alertes**
> Cours en temps réel, graphiques, répartition du portefeuille, alertes de prix.
>
> **Kalyx ne détient jamais tes fonds.** C'est un portefeuille non-custodial : tu es seul responsable de ta phrase de récupération. Garde-la précieusement.

---

## 3. Store copy (EN)

**App name:** `Kalyx — Crypto Wallet`

**Short description** (80 chars max):
> Non-custodial crypto wallet: send, swap, dApps, NFTs. Your keys, your crypto.

**Full description:**

> **Kalyx — your non-custodial crypto wallet, simple and premium.**
>
> Your private keys stay encrypted on your device — never on our servers. You keep full control of your funds.
>
> **✦ Multi-chain** — 60+ networks (Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche…) plus Bitcoin and Solana.
> **✦ Send & receive** — native coins and tokens (ERC-20, SPL), ENS names, QR, address book, balance check.
> **✦ Built-in Swap & Bridge** — trade and move across chains without leaving the app.
> **✦ dApp browser** — Uniswap, OpenSea, Aave… with WalletConnect and clear, readable signatures.
> **✦ NFTs** — your ERC-721 / ERC-1155 gallery.
> **✦ Security first** — biometrics, PIN, auto-lock, encrypted backup, transaction simulation to avoid scams.
> **✦ Tracking & alerts** — live prices, charts, portfolio allocation, price alerts.
>
> **Kalyx never holds your funds.** You alone are responsible for your recovery phrase — keep it safe.

---

## 4. Plan de captures d'écran (à capturer depuis l'app)

Capture **6 à 8 écrans** (téléphone, portrait, ≥ 1080×1920). Ordre conseillé + légende à ajouter :

1. **Accueil / portefeuille** — solde total + courbe → « Tous tes actifs, en un coup d'œil »
2. **Liste des réseaux** (avec logos) → « 60+ réseaux : ETH, Base, Solana, Bitcoin… »
3. **Swap** (devis affiché) → « Swap & bridge au meilleur prix »
4. **Navigateur dApps** (accueil premium) → « Uniswap, OpenSea… dans ton wallet »
5. **Fenêtre de signature** (TxPreview / approbation) → « Tu vois toujours ce que tu signes »
6. **Fiche token** (graphique) → « Cours, graphiques et alertes de prix »
7. **Galerie NFT** → « Ta collection NFT »
8. **Sécurité** (déverrouillage biométrique / sauvegarde) → « Biométrie, PIN, sauvegarde chiffrée »

**Comment capturer** : lance l'app (`npm start`), ouvre chaque écran, capture (bouton natif du téléphone). Astuce : utilise un compte de démo avec quelques actifs pour des visuels remplis. Je peux ensuite t'encadrer/ajouter les légendes si tu me transmets les captures brutes.

---

## 5. Métadonnées Play Console

- **Catégorie** : Finance
- **Tags** : crypto, wallet, web3, bitcoin, ethereum, defi, nft
- **Politique de confidentialité** (obligatoire) : héberger `PRIVACY.md` en ligne et coller l'URL.
- **Content rating** : questionnaire IARC (app financière, pas de contenu sensible).
- **Data safety** : Kalyx ne collecte pas de données perso ; clés stockées **localement**, jamais transmises (cf. `PRIVACY.md`).
- **Coordonnées** : e-mail de support.

## 6. Checklist de soumission
- [x] Icône 512×512
- [x] Feature graphic 1024×500
- [ ] 6–8 captures d'écran (§4)
- [x] Description courte + complète (FR/EN)
- [ ] URL politique de confidentialité en ligne
- [ ] Questionnaire content rating
- [ ] Section « Sécurité des données »
- [ ] Build AAB signé (`eas build --profile production`)
