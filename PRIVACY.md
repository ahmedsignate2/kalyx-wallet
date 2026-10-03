# Politique de confidentialité — Kalyx Wallet

_Dernière mise à jour : 3 octobre 2026_

> Généré par `scripts/gen-legal-md.mjs` depuis `web/content/privacy.ts` (source unique, aussi affichée par l'app et le site). Le français fait foi.

Éditeur : **KALYX (Entreprise individuelle de Ahamed Signate)** · SIREN 130 046 865 · Contact : support@kalyxwallet.com ou Telegram @kalyxntw (https://t.me/kalyxntw)

## 1. Le principe : 100% non-custodial
Kalyx Wallet est un portefeuille non-custodial. Vos clés privées et votre phrase de récupération sont générées et stockées UNIQUEMENT sur votre téléphone, chiffrées de bout en bout. Elles ne sont JAMAIS envoyées à KALYX (Entreprise individuelle de Ahamed Signate), ni à aucun serveur distant ou intermédiaire. Nous n'avons strictement aucun accès technique à vos fonds ni à votre phrase secrète.

## 2. Ce que nous ne collectons pas
Nous ne collectons aucune des données suivantes :
• Votre phrase de récupération (12 ou 24 mots)
• Vos clés privées et signatures
• Votre code PIN ou identifiant biométrique
• Aucune donnée d'identification personnelle (nom, adresse, numéro de téléphone, e-mail)
Il n'y a aucun compte utilisateur à créer. Aucune régie publicitaire ni traceur analytique n'est présent dans le code de l'application.

## 3. Données traitées exclusivement en local
Toutes les données suivantes demeurent confinées sur votre appareil personnel :
• Le coffre chiffré contenant vos clés privées
• Le carnet d'adresses et les contacts locaux
• La liste des réseaux personnalisés ajoutés
• L'historique de navigation dApps et les favoris
• Les préférences d'affichage et la devise de référence
• Le journal local des transactions et notifications
Vous pouvez à tout moment effacer l'intégralité de ces données en désinstallant ou réinitialisant l'application.
• Les réglages de sécurité : liste blanche d'adresses, code de contrainte (portefeuille leurre), délais de verrouillage
• Les adresses suivies en lecture seule, les alertes de prix et les sessions WalletConnect / TON Connect
• Les conversations avec le Copilote IA et l'historique des tickets de support

## 4. Services tiers sollicités par l'application
Pour afficher vos soldes et votre historique ou exécuter une opération, l'application interroge des services tiers. Ils reçoivent votre adresse IP et des données PUBLIQUES de blockchain (adresses, contrats, transactions) — jamais vos clés :
• Alchemy & nœuds RPC publics (PublicNode, dRPC…) — soldes, tokens, NFT, historique et diffusion des transactions (EVM)
• Ankr, Etherscan — historique des transactions (EVM), en repli
• Helius & RPC public Solana — soldes, NFT et historique (Solana)
• mempool.space — soldes, frais et historique (Bitcoin)
• TonAPI & TON Center — soldes, jettons, NFT, noms .ton, simulation et diffusion (TON). Les requêtes TonAPI transitent par un relais opéré par l'éditeur (Cloudflare Workers) : il voit votre adresse IP et vos adresses TON, n'en conserve aucune trace, et ne garde qu'une minute en cache les réponses publiques
• DefiLlama, CoinGecko, Frankfurter — prix des cryptos et taux de change
• LI.FI, Relay — devis de swap et de bridge ; Jupiter — swap sur Solana ; STON.fi — swap sur TON (reçoit votre adresse TON pour construire le devis) ; Tonstakers — staking TON
• WalletConnect (Reown) — relais chiffré avec les dApps, vérification du domaine (Verify) et paiements marchands (WalletConnect Pay)
• Ponts TON Connect (TON Foundation, Tonkeeper) — messages chiffrés de bout en bout avec les dApps TON
• GoPlus Security — analyse préventive des contrats, tokens et sites
• wsrv.nl — conversion des images de NFT dans un format affichable
• DuckDuckGo / Google Favicons — icônes des dApps dans le navigateur
• Google Drive — uniquement si vous activez la sauvegarde Google Drive : un fichier chiffré sur votre appareil (scrypt + AES-256-GCM) est déposé dans le dossier privé de l'application ; l'accès est révoqué immédiatement après l'opération et aucun jeton n'est conservé
• Fournisseur d'IA de votre choix (Copilot, clé personnelle) — uniquement si vous l'activez : soldes, réseau actif et activité récente masquée ; jamais vos adresses, clés ou phrase de récupération
Chacun de ces tiers applique sa propre politique de confidentialité. Le navigateur Web3 intégré permet d'accéder à des dApps autonomes appliquant leurs propres règles d'usage.

## 5. Tableau de bord web & mini-app Telegram
Le tableau de bord app.kalyxwallet.com (dans un navigateur ou dans Telegram) ne détient aucune clé : il se relie à l'app de votre téléphone par WalletConnect et chaque signature est validée sur le téléphone.
• Il reçoit les adresses PUBLIQUES que votre téléphone partage pendant la session, et interroge les mêmes services publics que l'app (§ précédent) pour afficher soldes et activité.
• Vos préférences et, si vous l'activez, votre clé d'API du Copilote sont stockées dans votre navigateur, chiffrées (AES-256-GCM, clé non exportable).
• Dans Telegram, le SDK officiel des mini-apps est chargé ; Telegram peut alors connaître l'usage de la mini-app selon sa propre politique. Dans un navigateur classique, aucun script tiers n'est chargé et la session se ferme après 30 minutes d'inactivité.
• Le site est hébergé par Cloudflare, qui traite l'adresse IP pour acheminer les pages.

## 6. Bot Telegram Kalyx
Le bot Telegram Kalyx ne demande ni ne reçoit jamais de clé ni de phrase. Pour fonctionner, il conserve dans une base Cloudflare (D1) :
• votre identifiant Telegram et la langue choisie ;
• les alertes de prix que vous créez (actif, seuil, sens, état).
Les commandes de prix, de gas et d'analyse de token interrogent des services publics (CoinGecko, DefiLlama, Binance, GoPlus, nœuds publics) sans transmettre votre identité. Une limitation de débit utilise un compteur temporaire (quelques minutes). Vous pouvez supprimer vos alertes à tout moment (/alerts), et demander l'effacement complet de vos données à support@kalyxwallet.com.

## 7. Vos droits (RGPD)
Les seules données personnelles que l'éditeur peut détenir sont celles du bot Telegram (§ précédent) et les messages que vous adressez volontairement au support. Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition, ainsi que du droit d'introduire une réclamation auprès de la CNIL (cnil.fr). Pour les exercer : support@kalyxwallet.com. Les données de l'application, elles, ne quittent pas votre appareil : vous en gardez l'entière maîtrise.

## 8. Notifications & alertes
Toutes les notifications générées par Kalyx Wallet sont strictement locales (générées au niveau du système d'exploitation de votre téléphone). Aucun serveur distant de notification push n'est sollicité, ce qui garantit qu'aucun jeton d'appareil (device push token) n'est jamais transmis à un tiers.

## 9. Mesures de sécurité cryptographiques
La phrase de récupération est chiffrée en AES-256-GCM avec une clé dérivée de votre code PIN (scrypt), puis stockée dans le stockage sécurisé du système (Keychain iOS / Keystore Android).
L'application dispose d'un verrouillage automatique dès la mise en veille, d'un écran de garde anti-capture d'écran et d'un ralentisseur anti brute-force sur le code PIN.
Bien que ces défenses soient à l'état de l'art, aucun système informatique n'est inviolable : il est impératif de conserver votre phrase de récupération écrite sur papier hors ligne.
Protections supplémentaires, toutes locales : liste blanche des destinataires (24 h avant qu'une adresse ajoutée ou une désactivation prenne effet), code de contrainte ouvrant un portefeuille leurre, copie biométrique de la phrase gardée par le système (empreinte ou visage exigé), explication et simulation des signatures avant validation, confirmation avant qu'un site change de réseau. La sauvegarde chiffrée utilise un mot de passe distinct du PIN (scrypt + AES-256-GCM).

## 10. Protection des mineurs
L'application Kalyx Wallet n'est pas destinée aux personnes de moins de 16 ans. Nous ne sollicitons ni ne conservons sciemment aucune information relative à des mineurs.

## 11. Mentions légales & Hébergement (LCEN)
Conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN) :
• Éditeur : KALYX (Ahamed Signate)
• Statut : Entrepreneur individuel
• SIREN : 130 046 865 — Code APE : 62.01Z
• Courriel de contact : support@kalyxwallet.com
• Hébergement du site kalyxwallet.com : Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA
• Hébergement de l'application : application mobile non-custodial exécutée localement sur l'appareil de l'utilisateur, sans serveur central de stockage de clés ni base de données d'utilisateurs. Seul le relais TON (sans journalisation) est opéré sur Cloudflare Workers.
Le détail complet de ces mentions figure sur la page dédiée « Mentions légales ».

## 12. Évolution de la politique & Contact
La présente politique de confidentialité peut être révisée pour refléter l'évolution des fonctionnalités ou du cadre réglementaire. La date de mise à jour fait foi. Pour toute demande relative à la protection des données ou pour signaler un problème de sécurité : support@kalyxwallet.com ou sur Telegram @kalyxntw.
