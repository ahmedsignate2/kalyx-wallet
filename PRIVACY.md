# Politique de confidentialité — Kalyx Wallet

_Dernière mise à jour : 27 septembre 2026_

> Généré depuis `lib/legalText.ts` (source unique). Le texte de l'application fait foi.

Éditeur : **KALYX (Entreprise individuelle de Ahamed Signate)** · SIRET 130 046 865 00015 · Contact : support@kalyxwallet.com ou Telegram @kalyxntw (https://t.me/kalyxntw)

## 1. Le principe : non-custodial
Kalyx Wallet est un portefeuille non-custodial. Tes clés privées et ta phrase de récupération sont générées et stockées UNIQUEMENT sur ton téléphone, chiffrées. Elles ne sont jamais envoyées à KALYX (Entreprise individuelle de Ahamed Signate), ni à aucun serveur. Nous n'avons aucun accès à tes fonds ni à ta phrase.

## 2. Ce que nous ne collectons pas
Nous ne collectons pas : ta phrase de récupération, tes clés privées, ton code PIN, ni aucune donnée d'identification personnelle. Il n'y a pas de compte à créer. Aucune analytique publicitaire ni pistage n'est intégré à l'application.

## 3. Données traitées localement
Restent sur ton appareil : le coffre chiffré (phrase), tes adresses publiques, contacts, réseaux personnalisés, favoris et historique du navigateur, sessions de connexion aux dApps (WalletConnect, TON Connect), préférences, cache des soldes et de l'historique, et le journal de notifications. Tu peux tout effacer en réinitialisant l'application.

## 4. Services tiers appelés par l'app
Pour afficher tes soldes, ton historique ou exécuter une opération, l'application interroge des services tiers. Ils reçoivent ton adresse IP et des données PUBLIQUES de blockchain (adresses, contrats, transactions) — jamais tes clés :
• Alchemy, nœuds RPC publics (PublicNode, dRPC…) — soldes, tokens, NFT, historique et diffusion des transactions (EVM)
• Ankr, Etherscan — historique des transactions (EVM), en repli
• Helius, RPC public Solana — soldes, NFT et historique (Solana)
• mempool.space — soldes, frais et historique (Bitcoin)
• TonAPI et TON Center — soldes, jettons, NFT, noms .ton, simulation et diffusion (TON). Les requêtes TonAPI passent par un relais opéré par l'éditeur (Cloudflare Workers) : il voit ton adresse IP et tes adresses TON, n'en garde aucune trace, et ne conserve qu'une minute en cache les réponses publiques
• DefiLlama, CoinGecko, Frankfurter — prix des cryptos et taux de change
• LI.FI, Relay — devis de swap et de bridge ; Jupiter — swap sur Solana ; Tonstakers — staking TON
• WalletConnect (Reown) — connexion aux dApps, vérification du domaine (Verify) et paiements marchands (WalletConnect Pay)
• Ponts TON Connect (TON Foundation, Tonkeeper) — messages chiffrés de bout en bout entre le portefeuille et une dApp TON
• GoPlus — analyse de sécurité (contrats, tokens, sites)
• wsrv.nl — conversion des images de NFT dans un format affichable
• Google Drive — uniquement si tu choisis la sauvegarde Drive : un fichier chiffré sur l'appareil, déposé dans le dossier privé de l'app, connexion révoquée aussitôt après
• Fournisseur d'IA de ton choix — uniquement si tu actives le Copilot avec ta propre clé : soldes, réseau et activité masquée, jamais tes adresses ni tes clés
• Google / DuckDuckGo — logos (favicons) du navigateur
Ces services ont leurs propres politiques de confidentialité. Le navigateur dApps intégré charge des sites tiers qui, eux aussi, appliquent leurs propres règles.

## 5. Notifications
Les notifications sont locales (générées sur l'appareil). Aucun serveur de notifications push n'est utilisé, donc aucun identifiant de push n'est transmis.

## 6. Sécurité
La phrase est chiffrée en AES-256-GCM avec une clé dérivée de ton PIN (scrypt), puis rangée dans le stockage sécurisé du système (Keychain iOS / Keystore Android). Verrouillage automatique, écran de garde et anti-brute-force protègent l'accès. Aucun système n'est infaillible : garde ta phrase de récupération hors ligne.

## 7. Enfants
Kalyx Wallet n'est pas destiné aux personnes de moins de 16 ans.

## 8. Modifications & contact
Cette politique peut évoluer ; la date de mise à jour ci-dessus fait foi. Pour toute question : support@kalyxwallet.com ou Telegram @kalyxntw (https://t.me/kalyxntw).
