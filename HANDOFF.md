# Nova Wallet — Sauvegarde de contexte (HANDOFF)

> Document de reprise. Résume l'état du projet, ce qui reste, les décisions et
> **les pièges déjà rencontrés** (à ne pas redécouvrir). Mis à jour : 2026-07-05.
> Wallet crypto **non-custodial** mobile, React Native / Expo (SDK 57), TypeScript.

---

## 1. Architecture (règle d'or)

Deux couches strictement séparées :

- **`src/` = le MOTEUR** (pur TypeScript, **testé**, aucune dépendance UI). Crypto,
  dérivation, chaînes, prix, swap, tokens, NFT. Exporté via le **barrel `src/index.ts`**.
  L'app n'importe QUE depuis `../src`. **244 tests jest** (vecteurs de référence +
  cross-check @scure/ethers). Testé via `npm test`.
- **`app/` (écrans expo-router)**, **`lib/` (stores zustand, logique app)**,
  **`ui/` (design system)** = la couche APP. Non testée par jest, mais typecheckée
  (⚠️ vraiment couverte depuis 2026-07-04 : le `include` du tsconfig omettait
  app/lib/ui — 15 erreurs corrigées à cette occasion, ne pas retirer du include).

**Biométrie partout (2026-07-05) :** toute action sensible (envoi, swap, WalletConnect
connexion+signature, navigateur dApps, révéler la phrase, approbations) passe par
`ui/ConfirmUnlock.tsx` : biométrie AUTO à l'ouverture (si activée) → repli PIN. Le
moteur `revealMnemonic` accepte `{biometric:true}` ; `walletStore.verifyUnlock` vérifie
l'identité sans exposer la seed. Le pont WC/dApp accepte un `Unlock`.
⚠️ **CHANGÉ 2026-07-09** : le secret biométrique n'est PLUS gated par le keystore
(`requireAuthentication`) — cette clé ne survivait pas aux nouveaux builds → biométrie
« cassée » alors que le PIN marchait. Nouveau schéma : `revealMnemonic` fait UN prompt
via `expo-local-authentication.authenticate()` PUIS lit le secret **non-gated**
(`secureStore` options `base`). Toujours 1 seul prompt (jamais `authenticate()` + lecture
gated). Migration douce : `healBiometric(pin)` ré-écrit le secret non-gated au 1er
déverrouillage PIN (appelé depuis `unlock.tsx`). Compromis : secret protégé par
WHEN_UNLOCKED_THIS_DEVICE_ONLY + check biométrie in-app (pas keystore matériel) — assumé
pour la fiabilité ; le PIN reste la voie forte.

**Invariants sécurité (voir SECURITY.md) :** ni seed ni clé privée dans le state ;
seed déchiffrée du coffre **à la volée** pour signer puis jetée ; jamais loggée ;
jamais sur le réseau. Le seul écart transitoire : `draftMnemonic` pendant l'onboarding.

### Stores (lib/)
- `walletStore.ts` — LE cœur : wallets, comptes, unlock, sign/send, swap, WC signing,
  multi-wallet. `revealMnemonic(walletId, unlock)` est la seule voie vers la seed.
- `settingsStore.ts` — nom profil, langue (i18n), devise fiat, biométrie, mode Débutant/Expert.
- `customTokensStore.ts`, `contactsStore.ts`, `walletconnect.ts`.
- `secureStore.ts` — wrappers expo-secure-store, **clés par wallet** (voir §5).
- `txError.ts` — `friendlyTxError()` : messages clairs (solde insuffisant, etc.).

---

## 2. Ce qui est FAIT (fonctionnel)

**Sécurité/core :** BIP-39 (12/24), HD BIP-32/44/84, coffre AES-256-GCM + PIN (scrypt),
biométrie, anti-brute-force, anti-capture seed, **multi-wallet** (créer/importer/gérer),
multi-comptes, changer PIN, révéler phrase, reset.
**Sauvegarde chiffrée (cloud backup, 2026-07-09)** : `src/domain/backup/cloudBackup.ts`
(`createBackup`/`restoreBackup`, réutilise `encryptSecret`/`decryptSecret` = scrypt+AES-GCM,
4 tests). La seed est chiffrée CÔTÉ CLIENT sous un mot de passe, emballée dans une enveloppe
JSON versionnée, partagée via `Share` natif (Drive/Files/e-mail) — rien vers un serveur.
UI : export `app/cloud-backup.tsx` (Menu → Sauvegarde chiffrée) ; restauration = 3ᵉ mode
« Sauvegarde » dans `app/import-wallet.tsx`. PK non concerné (pas de phrase). ⚠️ vaut le mot de passe.
**Import par clé privée** (2026-07-09) : wallet EVM importé depuis une clé privée brute
(`WalletMeta.type='privateKey'`, moteur `evmAccountFromPrivateKey`/`normalizeEvmPrivateKey`
cross-checkés ethers). Un seul compte, EVM UNIQUEMENT (pas de HD, ni BTC/Solana, ni phrase).
Coffre = la clé privée chiffrée ; toutes les voies de signature EVM passent par
`revealEvmSigningKey` (dérive la seed OU renvoie la clé importée). Cohabite avec les wallets
seed (ajout non destructif). `exportPrivateKey(unlock)` révèle la clé (marche aussi pour un
compte HD). UI : `app/import-wallet.tsx` (sélecteur Phrase/Clé privée). ⚠️ Onboarding
premier-run reste seed-only (le flux draft/backup/verify est mnémonique) — import PK =
wallet SUPPLÉMENTAIRE (écran Portefeuilles → Importer). Flux UI à tester sur device.

**Chaînes :** **65 réseaux** au catalogue (`configs.ts` + `ALL_CHAINS`) — 62 EVM
mainnet (RPC publics sondés eth_chainId), Sepolia + Monad (testnets), Bitcoin, Solana.
Ajouter un EVM = 1 entrée (adapter auto via `registry.ts`). Garde d'intégrité dans
`registry.test.ts` (id + evmChainId uniques, RPC https). Envoi/réception EVM, BTC, Solana.
**Solana COMPLET** : dérivation SLIP-0010 ed25519 (vector-testée, compat Phantom
`m/44'/501'/0'/0'`), solde, historique, tokens SPL (+ noms/logos réels via l'API
Jupiter v2, repli table curée `KNOWN_MINTS`), envoi SOL natif + SPL (ATA idempotent +
TransferChecked). Tout câblé jusqu'à l'UI (send/receive/wallet). ✅ **SOLANA
ENTIÈREMENT VALIDÉ sur device avec de vrais fonds** : envoi natif (2026-08-22,
0.001 SOL), envoi SPL (2026-08-23, 0.001 USDC, ATA + TransferChecked, croisé avec
Phantom), réception native et réception SPL (les deux confirmées, fonds bien reçus
dans Nova). Bitcoin est lui toujours non testé avec de vrais fonds (voir plus bas).

**Données réelles (CoinGecko/Alchemy/Etherscan) :** prix, marché, fiche token (24h→ALL),
recherche globale, tokens ERC-20 + ajout custom + anti-spam, NFT, historique EVM, valeur totale fiat.

**Services :** Swap+Bridge (LI.FI, **fee intégrateur `nova` 0,3 % → monétisé**),
WalletConnect (connexion dApps + signature SIWE/tx avec PIN).

**UI :** design premium (glass violet/bleu), icônes SVG (Ionicons), animations (scale,
skeletons, transitions), i18n 15 langues, 7 devises, contacts, mode Débutant/Expert,
bottom nav 5 onglets + FAB, ErrorBoundary.

---

## 3. Ce qui RESTE / à AMÉLIORER

### Finitions rapides (sans rebuild)
- ✅ ~~Fenêtre de signature WalletConnect enrichie~~ (fait 2026-07-04) : SIWE décodé +
  anti-phishing (domaine SIWE ≠ site → alerte), logo/nom dApp, résumé Site/Adresse/Réseau/Action,
  résumé EIP-712 (Permit…) et tx (vers/montant/données), détails techniques repliables.
  Moteur : `src/domain/wc/message.ts` (hexToText, parseSiwe, siweDomainMismatch,
  summarizeTypedData — 13 tests). UI : `ui/WalletConnectHost.tsx`.
- ✅ ~~Warnings WC~~ : `Record was recently deleted` filtrés dans `walletconnect.ts::init()`.
- ✅ ~~Graphique de prix interactif~~ (fait 2026-07-04) : `ui/InteractiveChart.tsx`
  (scrub façon Revolut : crosshair, haptique, prix/date sous le doigt) + police Inter
  chargée dans `_layout` (`fontFamily` par graisse, plus de `fontWeight`).
- ✅ ~~Vraie courbe portefeuille (accueil)~~ (fait 2026-07-04) : la sparkline du hero
  était factice ; désormais courbe 24h réelle + P&L en devise dans le badge.
- ✅ ~~Donut de répartition~~ (fait 2026-07-04) : `ui/AllocationDonut.tsx` sur l'écran
  Portefeuille. Palette catégorielle FIXE `#7C5CFF #3390EC #1FA96E #C9831C #B85F8F`
  validée daltonisme/contraste (skill dataviz) — ne pas cycler d'autres couleurs.

- ✅ ~~Apparence (thème clair/sombre)~~ (fait 2026-07-04) : `useTheme()` partout,
  palettes dans `ui/theme.ts` (thèmes construits une fois, refs stables), préférence
  `themePref` persistée (Réglages → Apparence : Système/Sombre/Clair), StatusBar suit.
  **Règles :** plus AUCUN import statique `colors/typography/gradients/shadow` (le
  typecheck le garantit) ; dans `ui/`, StyleSheet par thème via cache par mode ;
  `Icon` a `tone="muted"|"faint"` pour les helpers module-level ; l'écran de crash
  (`ErrorBoundary`) reste volontairement en couleurs codées en dur.
  ⚠️ Vérif visuelle sur device encore à faire (les 29 écrans en mode clair).

- ✅ ~~Activité inline sur l'accueil~~ (fait 2026-07-04) : 4 dernières tx réelles
  (reçu/envoyé, date relative, montant signé, échec), skeleton + état vide.
- ✅ ~~Écran de succès animé~~ (fait 2026-07-04) : `ui/SuccessModal.tsx` (cercle pop +
  coche dessinée + vibration, hash + lien explorer) — branché sur Envoi et Swap.
- ✅ ~~Fiche NFT~~ (fait 2026-07-04) : `ui/NftDetailModal.tsx` au tap dans la galerie
  (image, collection, contrat/tokenId copiables, explorer). Icône `copy` ajoutée.
- ✅ ~~Boutons « Bientôt »~~ (fait 2026-07-04) : Convert → /swap, « Tout voir » marché
  → /market, Buy grisé-tappable (prop `dimmed` de CircleAction), faux badge cloche retiré.

- ✅ ~~Retours de review externe~~ (fait 2026-07-04) : `ui/TxRow.tsx` partagé
  (logo crypto + pastille direction, statut Confirmée/Échouée, heure exacte,
  contre-valeur fiat au cours ACTUEL — pas historique, rate-limit), détail de tx
  au tap (adresses copiables + explorer), `ui/CountUp.tsx` (solde animé accueil +
  portefeuille), favoris épinglables (★ fiche token, persisté dans settings,
  onglet Favoris réel). Pas de statut « En attente » : Etherscan = tx minées only.

**→ Cap UI « battre MetaMask/Phantom » (2026-07-04) : TOUT EST LIVRÉ.**
Reste côté visuel : vérif sur device du mode clair + des nouveautés (aucun rendu
n'a été vu), pass d'animation sur l'onboarding (welcome/create), assets store
(icône/splash/captures). Prochain gros cap discuté : **navigateur dApps intégré**
(WebView + injection EIP-1193 — prévu v2, voir §3 gros morceaux) ; Ledger/Trezor.

### Testnets séparés (2026-07-10)
- Les **testnets/devnets sont cachés par défaut** (`settings.showTestnets = false`) et
  **séparés du mainnet**. Activation : Menu → (mode Expert) → **Développeur** → « Activer
  les testnets » (toggle déplacé depuis Extensions). `networks.tsx` affiche deux sections
  distinctes (Réseaux principaux / Réseaux de test + badge « AUCUN FONDS RÉEL »). Le
  sélecteur du navigateur respecte `showTestnets`. `DEFAULT_CHAIN` = **`ethereum`** (était
  `sepolia`, un testnet → aurait été invisible/injoignable une fois les testnets cachés).
  ⚠️ `listChains()` sans arg garde includeTestnets=true (résolution par chainId : scan, dApp).

### Clavier (2026-07-09)
- ✅ **Écrans clavier-aware** : `Screen` et `PremiumScreen` (ui/) enveloppent le contenu
  dans un `KeyboardAvoidingView` → le champ actif (montant, adresse, mot de passe…)
  remonte au-dessus du clavier. `Screen` a une prop **`scroll`** : les écrans-FORMULAIRES
  plats la passent (`<Screen scroll>`, = KAV + ScrollView, `flexGrow:1` garde les spacers) ;
  les écrans-LISTES gardent leur propre ScrollView/FlatList (pas de double défilement).
  Appliqué à send + add-token. **Règle : tout nouvel écran-formulaire = `<Screen scroll>`
  (ou PremiumScreen).** ⚠️ Les MODALES bottom-sheet avec input système (ex. saisie PIN
  navigateur) ne sont pas encore KAV — à traiter au cas par cas si gênant.

### UX listes (2026-07-04)
- ✅ **Tous les écrans-listes sont défilables** (bug trouvé : la liste Réseaux
  débordait après l'ajout de 3 chaînes). Réseaux (+ recherche > 6 réseaux +
  auto-scroll vers l'actif), Comptes, Portefeuilles, Contacts, reveal-phrase,
  create-wallet, WalletConnect. Padding bas = safe-area + marge. **Règle : tout
  nouvel écran-liste doit être dans un ScrollView/FlatList avec padding bas.**

### Ressenti / feedback (2026-07-04)
- ✅ **Toasts maison** `lib/toast.ts` + `ui/ToastHost.tsx` (bandeau animé, icône/
  couleur par type, vibration, auto-dismiss) montés dans `_layout`. Usage :
  `import { toast } from '../lib/toast'; toast.success('Titre','détail')`.
  Les Alert de FEEDBACK sont convertis ; les Alert de CONFIRMATION (boutons :
  envoi, swap, reset, suppression wallet) restent volontairement natifs.
  → Pour tout nouveau retour non bloquant, utiliser `toast`, PAS `Alert.alert`.
- ✅ **Onboarding premium** (2026-07-04) : `welcome` (hero animé lion + stagger),
  `backup` (voile « appuie pour révéler » + avertissement + grille glass),
  `verify` (cartes glass + coche verte), `import` (bouton Coller + compteur).
  ✅ `set-pin` et `change-pin` sont désormais sur **PinPad** (fait 2026-07-05, cf. §3).
- ✅ **Révocation d'approbations** (2026-07-04, façon revoke.cash) :
  `src/domain/approvals/approvals.ts` (helpers purs, 6 tests) +
  `EvmChainAdapter.getApprovals(owner, tokens)` (logs Approval → allowance) +
  `app/approvals.tsx` (Menu → Approbations, révoque via pop-up PIN + toast).
  ⚠️ **Limite v1** : ne couvre que les tokens DÉTENUS (getLogs address-filtré, pas
  d'indexeur). Les approbations sur tokens à solde nul ne sont pas listées.
  À TESTER après rebuild : le getLogs full-range peut buter sur les limites RPC
  Alchemy → prévoir un fallback par plages si besoin.
- ✅ ~~Noms ENS + avatars partout~~ (fait 2026-07-05) : moteur `src/domain/ens/ens.ts`
  (ethers v6, provider mainnet dédié, cache TTL 5 min, dégradation → null ; 11 tests +
  vérif live). Câblé : **envoi** (saisir `vitalik.eth` → résout l'adresse, débruité,
  ✓ sous le champ, confirmation nom+adresse, adresse résolue signée) ; **historique**
  (`ui/TxRow.tsx`) et **contacts** via le hook `lib/useEns.ts` (`useEnsName`/`useEnsAvatar`).
- ✅ ~~`set-pin`/`change-pin` au PinPad~~ (fait 2026-07-05) : flux multi-étapes sur le
  PinPad premium (set-pin : créer → confirmer ; change-pin : ancien → nouveau →
  confirmer, WRONG_PIN renvoie à l'étape 1). Plus AUCUN écran PIN en TextInput brut.
- ✅ ~~Sauvegarde des réseaux perso~~ (fait 2026-07-05) : un réseau EVM custom n'est
  pas dérivable de la seed → export/import portable (Développeur → Réseaux perso :
  « Sauvegarder » via Share, « Restaurer » depuis le presse-papier). Moteur pur
  `src/domain/chains/customNetworks.ts` (enveloppe versionnée, validation EVM, dédup ;
  9 tests) + `customChainsStore.exportBackup/importBackup`. Données non sensibles (pas
  de chiffrement). Survit à une réinstallation (les fonds restent on-chain).
- Prochaine priorité UI : passe d'anim onboarding backup/verify/import ; icône store PNG.

### Marque & onboarding (2026-07-04)
- ✅ **Le lion est l'emblème de Nova** : `ui/NovaLogo.tsx` (SVG géométrique,
  crinière dégradée). Utilisé dans splash, déverrouillage, welcome. ⚠️ C'est le
  logo AFFICHÉ (SVG) ; l'**icône du store** (`assets/*.png`, `app.config.ts` n'en
  déclare pas encore) reste à générer depuis ce dessin (asset raster séparé).
- ✅ **Splash animé** `ui/Splash.tsx` (lion + vibration à l'ouverture, façon
  Phantom), monté dans `_layout` par-dessus tout.
- ✅ **Déverrouillage repensé** `app/unlock.tsx` + `ui/PinPad.tsx` (points animés,
  pavé numérique haptique, secousse à l'erreur, bouton biométrie). PinPad
  RÉUTILISABLE → branché sur unlock, set-pin ET change-pin (2026-07-05).
- ✅ **FIX double empreinte** : le déverrouillage appelait `authenticate()` PUIS
  lisait un secret SecureStore `requireAuthentication` (= 2 prompts). L'appel
  explicite est retiré ; la lecture gated EST le prompt unique. Ne PAS le
  réintroduire. `userInterfaceStyle: 'automatic'` déjà posé.
- ✅ **Écran de code peaufiné** (retours UX 2026-07-04) : « Bon retour {nom} »,
  bouton biométrie visible au-dessus du pavé, ronds 16px animés (pop), touches en
  relief, ⌫ agrandi, bouton grisé→fondu, **fondu de sortie 240ms** au succès.
  **Option 3 ronds** : `settings.pinLength` mémorise la LONGUEUR du PIN (posée à
  create/change/unlock réussi) → nb de ronds exact + auto-validation. N'expose que
  la longueur (petit compromis assumé), jamais le PIN.
- ✅ **Pop-up PIN** `ui/PinPromptModal.tsx` (lion + PinPad) : activer la biométrie
  dans Réglages passe par ce beau modal (avant : champ inline peu visible).
- ✅ **FIX CRASH** : `expo-notifications` absent (avant rebuild) plantait l'app
  (`ExpoPushTokenManager`). `lib/notifications.ts` teste la présence native via
  `requireOptionalNativeModule` AVANT d'importer. NE PAS réimporter en dur.
- Reste onboarding : passe d'anim sur backup/verify/import ; empty states illustrés ;
  icône store PNG.

### Gros morceaux (rebuild / partenaires)
- ✅ ~~Navigateur Web3 intégré~~ (fait 2026-07-04, **ACTIF** — rebuild fait) :
  `app/browser.tsx` + `lib/dappProvider.ts`. EIP-1193 + EIP-6963, connexion par
  origine https, signatures décodées + PIN, RPC lecture seule en liste blanche.
  Entrée : Menu → Navigateur dApps.
  UI 2026-07-09 : barre de progression de chargement animée (`LoadBar`, onLoadProgress,
  façon Safari/Chrome) + sélection auto de l'URL au focus (selectTextOnFocus + clear).
  Icônes réseau réelles partout via `chainIconUrl` + `RemoteIcon` (repli lettré).
- ✅ **REBUILD DÉJÀ FAIT** (2026-07-09, confirmé par l'utilisateur) : le dev build EAS a
  été réalisé → **WebView (navigateur), expo-notifications, `userInterfaceStyle: automatic`
  sont ACTIFS**. ⚠️ **NE PLUS dire « il faut rebuild » / « à tester après rebuild »** pour
  ces fonctions : c'est en place et ça marche. Un NOUVEAU rebuild n'est nécessaire QUE pour
  un **nouveau** module natif absent du build actuel (ex. Ledger/BLE pas encore câblé). Tout
  changement JS (moteur, écrans, config, props d'un composant natif déjà buildé comme
  `onLoadProgress`) = simple **`r`** dans Metro, sans rebuild. Voir mémoire `nova-build-done`.
- ✅ ~~DeFi / Staking (v1)~~ (fait 2026-07-04) : `src/domain/defi/registry.ts`
  classe les ERC-20 détenus (stETH/wstETH/rETH/cbETH/sDAI/stMATIC + heuristiques
  Aave/Compound/Lido/Rocket Pool, 5 tests). `wallet.tsx` : onglets DeFi/Staking
  listent les positions (total, protocole, valeur) ; vide → CTA navigateur dApps
  (`/browser?url=…`). **v2 = APR, unstake in-app, plus de protocoles.**
- ✅ ~~Alertes de prix~~ (2026-07-09) : `src/domain/alerts/priceAlerts.ts` (`alertTriggered`,
  3 tests) + `lib/priceAlertsStore.ts` (persisté, one-shot) + `ui/PriceAlertWatcher.tsx`
  (vérifie au montage / retour premier plan / toutes les 90 s en FOREGROUND — pas de push,
  `notifyAndLog('price',…)`). UI : création depuis la fiche token (🔔 → modale seuil au-dessus/
  en-dessous), liste `app/price-alerts.tsx` (Menu → Alertes de prix). ⚠️ Foreground only ;
  push serveur = plus tard. Respecte le réglage `notifPrice`.
- ✅ ~~Notifications locales~~ (code fait 2026-07-04, actif après rebuild) :
  `lib/notifications.ts` (import dynamique, no-op avant rebuild), notif de tx
  réussie (send+swap), interrupteur Réglages. **Push (Alchemy Notify) = plus tard.**
- ✅ ~~Inviter des amis~~ (fait 2026-07-04) : `app/invite.tsx` (code parrain dérivé
  de l'adresse, Share natif, texte honnête « récompenses à venir »). **Programme de
  récompenses réel = besoin backend + attribution → plus tard.**
- **Ledger** : deps installées (`react-native-ble-plx`, `@ledgerhq/react-native-hw-transport-ble`,
  `hw-app-eth`), plugin + permissions configurés. Le câblage (scan BLE, appairage,
  compte matériel dans walletStore, signature déléguée) reste à faire APRÈS le
  rebuild, avec un Nano physique pour tester. **Trezor** : pas de BLE — passe par
  OTG/USB ou Trezor Connect (plus tard).
- **Achat/Vente fiat** (MoonPay/Transak/Ramp) — partenaire régulé + KYC.
- ✅ ~~Envoi Bitcoin~~ (fait 2026-07-04, P2WPKH/SegWit) : `src/domain/chains/btcTx.ts`
  (helpers purs sélection UTXO + frais, 6 tests) + `BitcoinChainAdapter.sendBitcoin`
  (UTXO + fee mempool.space, @scure/btc-signer en IMPORT DYNAMIQUE car ESM pur
  incompatible Jest top-level) + `walletStore.signAndSend` branché par famille.
  ⚠️ **JAMAIS testé sur device** : valider au rebuild avec un PETIT montant réel
  (une dérivation/signature fausse = fonds perdus). Historique BTC toujours [].
- Chaînes EVM ajoutées : Arbitrum, Optimism, Avalanche (complètes d'office).
- ✅ ~~Solana~~ (fait) : adapter ed25519/base58 complet, vector-testé (voir §2).
  **ENTIÈREMENT validé sur device avec de vrais fonds** : envoi natif (SOL, 2026-08-22),
  envoi SPL (USDC, 2026-08-23, ATA + TransferChecked), réception native et SPL. Plus
  aucun point d'attention Solana.
- Nouvelles chaînes restantes : Tron, XRP, Sui, Aptos, Near… (adapters dédiés par famille).
- **Carte virtuelle** Visa/MC (Immersve/Baanx/Gnosis Pay) — régulé.

### Durcissement avant lancement
- **Audit de sécurité externe** (obligatoire avant de vrais fonds).
- Tests E2E sur device ; détection root/jailbreak.
- ✅ ~~Assets store~~ (2026-07-10) : icône, splash, adaptive-icon FAITS (assets/, RGBA 1024²,
  configurés app.config.ts). Feature graphic 1024×500 + icône Play 512² générés dans
  `assets/store/` via `node scripts/gen-store-assets.js` (@resvg/resvg-js, devDep). Kit de
  listing complet (textes FR/EN, plan de captures, checklist) : `STORE_LISTING.md`.
  ⚠️ Reste à CAPTURER les 6–8 screenshots depuis l'app (device only, voir §4 du kit).
- ✅ ~~auto-lock arrière-plan + écran de garde~~ : DÉJÀ FAIT (`ui/AutoLock.tsx` = AppState
  background→lock selon `autoLockMinutes`, 0=immédiat ; `ui/PrivacyScreen.tsx` = FLAG_SECURE
  hors premier plan + voile). Réglages : Sécurité → Verrouillage auto / Écran de garde.
- ✅ ~~compteurs anti-brute-force persistés~~ : FAIT (`saveLockState`/`loadLockState`, cf. §2).
- ✅ ~~Simulation/décodage de transaction~~ (2026-07-09) : `src/domain/tx/decodeTx.ts`
  (`decodeTx`/`isRiskyTx`, 7 tests) décode LOCALEMENT une tx avant signature — transfert,
  `approve` (détection ILLIMITÉ), `setApprovalForAll` (accès à TOUS les NFT), natif. Pas
  d'API payante (Alchemy `simulateAssetChanges` = gated). UI : `ui/TxPreview.tsx` (résout
  symbole/décimales du token, montants lisibles, bannière rouge si risqué) branché dans
  `app/browser.tsx` et `ui/WalletConnectHost.tsx` (fenêtres d'approbation de tx).
- ✅ ~~EIP-712 lisible~~ (2026-07-09) : `summarizeTypedData` extrait désormais les champs
  sensibles du message (spender, token, montant avec détection **Illimité**, échéance
  **Sans expiration**) — Permit ERC-2612 ET Permit2 (imbriqué). Affiché en rouge si dangereux
  dans `WalletConnectHost` et `app/browser.tsx`. 16 tests. Anti-drain : on voit QUI et COMBIEN.

---

## 4. Clés API (dans `.env`, gitignoré ; `EXPO_PUBLIC_*` inliné au build)

| Variable | Service | Rôle | Statut |
|---|---|---|---|
| `EXPO_PUBLIC_ALCHEMY_KEY` | Alchemy | RPC EVM fiable + tokens ERC-20 + NFT | ✅ en place |
| `EXPO_PUBLIC_ETHERSCAN_KEY` | Etherscan V2 | historique + transferts ERC-20 | ✅ |
| `EXPO_PUBLIC_COINGECKO_KEY` | CoinGecko | prix/marché (marche même sans clé) | ✅ (optionnel) |
| `EXPO_PUBLIC_LIFI_KEY` | LI.FI | swap+bridge (fee `nova` 0.3% configuré sur portal.li.fi) | ✅ |
| `EXPO_PUBLIC_0X_KEY` | 0x | swap same-chain (non utilisé, LI.FI suffit) | slot prêt |
| `EXPO_PUBLIC_WALLETCONNECT_ID` | Reown/WalletConnect | connexion dApps | ✅ |

**IMPORTANT pour les builds EAS** : `.env` étant gitignoré, il faut aussi déclarer ces
variables côté EAS (`eas env:create --environment development --name … --value … --visibility plaintext`),
sinon elles ne sont PAS embarquées dans l'APK/dev-build.

---

## 5. Décisions d'architecture importantes

- **Multi-wallet NON DESTRUCTIF** : le wallet historique = id **`primary`** qui garde les
  clés SecureStore d'origine (`nova.vault` / `nova.accounts` / `nova.bioSeed`). Les nouveaux
  wallets ont des clés suffixées (`nova.vault.{id}`…). Migration douce au boot (voir
  `walletStore.bootstrap`). **Un seul PIN d'app** chiffre tous les coffres ; `changePin`
  les re-chiffre tous. Biométrie par wallet.
- **ChainAdapter** (`src/domain/chains/`) : interface commune ; `EvmChainAdapter` paramétré
  couvre tous les réseaux EVM (même clé/adresse, seul le RPC change). Ajouter un EVM = 1 config.
  Bitcoin = adapter séparé. Solana/Tron = futurs adapters.
- **Prix libs** : écosystème `@noble`/`@scure` (audité) + `ethers` v6. Jamais de crypto maison.

---

## 6. PIÈGES DÉJÀ RENCONTRÉS (⚠️ ne pas refaire)

1. **`require('crypto')` Node dans du code embarqué** → Metro plante (`Unable to resolve
   module crypto`). Solution : n'utiliser que `globalThis.crypto.getRandomValues`
   (présent en RN via `react-native-get-random-values` chargé EN PREMIER dans `index.js`,
   et dans Node 18+). Voir `src/crypto/random.ts`.
2. **`TextDecoder`** absent sur Hermes → crash. Utiliser `bytesToUtf8` de `@noble/hashes/utils`.
3. **`metro.config.js` manquant** → les polices `.ttf` d'`@expo/vector-icons` ne se résolvent
   pas (`ttf` pas dans assetExts). Fichier présent maintenant (`getDefaultConfig`).
4. **Sélecteur zustand instable** : `useStore((s) => s.x ?? [])` crée une **nouvelle réf à
   chaque rendu** → boucle infinie « Maximum update depth ». Sélectionner l'objet stable
   puis dériver avec `useMemo`. (cf. wallet.tsx `customByChain`).
5. **WalletConnect SDK = modules natifs** (`async-storage`) : importé en **import DYNAMIQUE**
   dans `lib/walletconnect.ts::init()` pour ne pas crasher l'app avant un rebuild. **Un
   rebuild du dev build est nécessaire** pour que WC marche.
6. **LI.FI fee** : le fee intégrateur (`integrator=nova&fee=0.003`) est **rejeté** tant que
   le wallet de collecte n'est pas configuré par chaîne sur portal.li.fi. `getSwapQuote`
   réessaie **sans fee** en repli pour ne pas bloquer le swap. (Config portail = faite.)
7. **Cache npm sur PRoot** : `rename` échoue → utiliser `--cache <dossier neuf>` (ex.
   `$CLAUDE_JOB_DIR/tmp/npmcacheN`) et réessayer.
8. Warnings WC `Record was recently deleted - proposal` = **bénins** (nettoyage heartbeat).
   (Filtrés depuis 2026-07-04 dans `walletconnect.ts::init()`.)
9b. **NFT jamais affichés (403 Alchemy)** — CORRIGÉ 2026-07-09. `getNfts` envoyait
   `excludeFilters[]=SPAM` (et `spamConfidenceLevel`), **réservés au plan payant** Alchemy :
   le plan gratuit répond **403 sur TOUTE la requête** → `getNfts` catchait → `[]`, donc
   0 NFT quelle que soit l'adresse. Fix : retirer ces params, filtrer le spam CÔTÉ CLIENT
   via `contract.isSpam` (fourni gratuitement dans `withMetadata`), `pageSize=100`.
   ⚠️ Ne jamais réintroduire un param de plan payant sans repli. Vérifié en live vs API réelle.
9c. **ERC-20 légitimes masqués par le spam** — CORRIGÉ 2026-07-09. `getErc20Tokens`
   faisait `parseTokenBalances(...).slice(0, 40)` **avant** le filtre anti-spam et
   ignorait le `pageKey` (pas de pagination). L'ordre des soldes étant arbitraire et
   les airdrops spam nombreux, un vrai token pouvait tomber au-delà de l'index 40 (ou
   en page 2) → invisible, même pour un utilisateur normal. Fix : pagination bornée
   (`MAX_BALANCE_PAGES=5`, `'erc20'` explicite + `{pageKey}`), spam filtré AVANT le
   plafond, plafond appliqué APRÈS filtrage (`MAX_TOKENS=60`, métadonnées par lots de
   100). Vérifié live : 317 soldes scannés vs 40 avant. ⚠️ Ne jamais re-plafonner
   avant le filtre anti-spam.
9d. **USDC (et blue-chips) non détectés — énumération Alchemy incomplète** — CORRIGÉ
   2026-07-09. `alchemy_getTokenBalances(addr,'erc20')` n'énumère PAS de façon fiable
   tous les tokens détenus : un solde USDC bien réel est absent de la liste (vérifié
   live sur Base). Fix : `knownTokensFor(evmChainId)` (`src/domain/tokens/knownTokens.ts`,
   adresses vérifiées via metadata) interroge USDC/USDT/DAI/WETH/… par contrat EXPLICITE,
   fusionnés en tête (jamais évincés par le plafond). Ajouter un token connu = 1 adresse.
9e. **Historique absent hors Ethereum/Arbitrum/Polygon** — CORRIGÉ 2026-07-09. L'API
   Etherscan V2 gratuite ne couvre PAS toutes les chaînes : Base/Optimism renvoient
   « Free API access is not supported for this chain » (result non-tableau). `getHistory`
   détecte ce cas (result pas un tableau) et bascule sur `ChainConfig.explorerApi` (repli
   Blockscout, même format txlist — Base: base.blockscout.com/api, Optimism:
   explorer.optimism.io/api). Ajouter le repli d'une chaîne = renseigner `explorerApi`.
9f. **Solde natif à 0 si tous les RPC d'une chaîne sont morts** — un getBalance qui
   échoue retombe silencieusement sur `raw=0` (wallet.tsx), affichant un faux solde nul.
   Sonde live 2026-07-09 des 63 réseaux mainnet : seul **Fantom** échouait (rpc.ftm.tools
   = 403 clé désactivée, publicnode mort) → RPC remplacés (fantom.drpc.org, rpc.fantom.network,
   1rpc.io/ftm). 0/63 échec ensuite. ⚠️ Re-sonder périodiquement : les RPC publics tombent.
9g. **RN `<Image>` ne décode pas le WebP sur iOS** — les icônes réseau (DefiLlama)
   sont servies en `image/webp` malgré l'extension `.jpg` → l'image échouait (surtout iOS)
   et `RemoteIcon` retombait sur la lettre (« E » pour les L2 ETH). Fix (`chainIconUrl`,
   `src/domain/chains/icons.ts`) : router via le proxy `wsrv.nl` (`&output=png`) qui
   convertit en PNG (rendu fiable iOS+Android). Fallback lettré si le proxy échoue.
9. **`Requiring unknown module "NNNN"`** au chargement de WalletConnect = **lazy bundling
   Metro** : en dev, Expo découpe chaque `await import(...)` en bundles séparés dont les
   IDs de modules se désynchronisent du bundle principal (symptôme : IDs réclamés juste
   au-dessus du nombre de modules d'index.js). Solution : **`EXPO_NO_METRO_LAZY=1`**,
   posé **dans `metro.config.js`** (`process.env.EXPO_NO_METRO_LAZY = '1'`) car @expo/cli
   lit cette var **à la volée** à chaque requête de bundle → marche avec `npx expo start`
   comme `npm start` (l'avoir seulement dans le script npm ne suffit PAS si on lance
   `npx expo start`). Tout dans un seul bundle cohérent. Les `import()` dynamiques restent
   dans le code (utiles si modules natifs absents). Dev only. **Après ce changement,
   relancer avec `--clear` une fois.**

---

## 7. Workflow de dev

- **Metro (téléphone = Termux, même appareil)** : **`npm start`** (= `EXPO_NO_METRO_LAZY=1
  expo start --dev-client --localhost`). Ajouter `-- --clear` après un ajout de fichiers.
  Le `--localhost` évite l'IP LAN (marche en 4G, sans data, loopback). PAS `--tunnel`
  (lent, consomme). Recharger = `r`.
- **Reload vs Rebuild** : changement JS → juste `r`. Nouveau **module natif** (async-storage,
  vector-icons la 1re fois, expo-notifications futur) → **rebuild** :
  `eas build --profile development --platform android` (Termux, pas d'Android Studio).
- **Vérif avant commit** :
  - `npm test` (jest, moteur) — doit rester **vert (103)**.
  - Typecheck app+lib+ui : **`tsconfig.check.json` est versionné** (racine ; exclut les
    `*.test.ts` pour éviter le bruit des globals jest). Lancer :
    `npx tsc -p tsconfig.check.json | grep 'error TS' | grep -v tsconfig` (vide = OK).
- **Diagnostic crash** : `ErrorBoundary` (ui/ErrorBoundary.tsx) affiche l'erreur à l'écran ;
  logs `[Nova]` dans le **terminal Metro** (pas logcat) via `index.js` (ErrorUtils global).
- **Build APK autonome (usage réel hors Metro)** : `eas build --profile preview --platform android`.

---

## 8. Fichiers clés
- Docs plan : `docs/01…07`, `SECURITY.md`, `MOBILE_SETUP.md`, `ANDROID_GUIDE.md`, `README.md`.
- Moteur : `src/crypto/*`, `src/domain/chains/*`, `src/domain/prices/coingecko.ts`,
  `src/domain/swap/lifi.ts`, `src/domain/tokens/alchemyTokens.ts`, `src/domain/nft/alchemyNft.ts`.
- App : `app/home|wallet|market|swap|menu|token/[id]|walletconnect|contacts|wallets|…`.
- CI : `.github/workflows/ci.yml` (typecheck + tests + garde anti-log de secret).

---

## 9. Prochaine étape recommandée
**Apparence (thème clair/sombre)** — refactor `useColors()` + écrans, sans rebuild. Puis les
gros morceaux (notifs, Ledger, fiat) selon priorité produit. La fenêtre de signature WC
enrichie (SIWE + anti-phishing) est faite mais **à tester sur device** (reconnexion à une
dApp type OpenSea). **Audit sécurité avant tout vrai fonds.**
