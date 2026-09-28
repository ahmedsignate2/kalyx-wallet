/**
 * Textes légaux (source unique) : rendus dans l'écran Légal in-app ET recopiés
 * dans PRIVACY.md / TERMS.md et sur le site (web/content) pour hébergement
 * (URL requise par le Play Store).
 *
 * Le FRANÇAIS fait foi (éditeur établi en France). L'anglais est servi à toutes
 * les autres langues : avant, un utilisateur coréen ou allemand lisait la
 * politique en français.
 *
 * Mise à jour du 27/09/2026 : la liste des services tiers (§4) était périmée —
 * elle omettait la source principale des prix (DefiLlama), les indexeurs
 * d'historique (Ankr), Solana (Helius), TON (TonAPI, TON Center, ponts TON
 * Connect), Bitcoin (mempool.space), la conversion d'images de NFT, et surtout
 * le relais TON de l'éditeur, par lequel passent l'adresse IP et les adresses
 * TON. Le dire est une obligation, pas une option.
 *
 * ⚠️ BROUILLONS à faire relire par un juriste avant une mise en production
 * réelle avec de vrais fonds.
 */
import { LEGAL_CONSTANTS } from '../src/constants/legal';

export const LEGAL_UPDATED = '27 septembre 2026';
export const LEGAL_UPDATED_EN = 'September 27, 2026';
export const LEGAL_PUBLISHER = LEGAL_CONSTANTS.COMPANY_NAME;
export const LEGAL_COUNTRY = 'France';
export const LEGAL_CONTACT = `${LEGAL_CONSTANTS.CONTACT_EMAIL} ou Telegram @kalyxntw (${LEGAL_CONSTANTS.TELEGRAM_URL})`;
const LEGAL_CONTACT_EN = `${LEGAL_CONSTANTS.CONTACT_EMAIL} or Telegram @kalyxntw (${LEGAL_CONSTANTS.TELEGRAM_URL})`;

export interface LegalSection {
  title: string;
  body: string;
}

export const PRIVACY: LegalSection[] = [
  {
    title: '1. Le principe : non-custodial',
    body: `Kalyx Wallet est un portefeuille non-custodial. Tes clés privées et ta phrase de récupération sont générées et stockées UNIQUEMENT sur ton téléphone, chiffrées. Elles ne sont jamais envoyées à ${LEGAL_PUBLISHER}, ni à aucun serveur. Nous n'avons aucun accès à tes fonds ni à ta phrase.`,
  },
  {
    title: '2. Ce que nous ne collectons pas',
    body: `Nous ne collectons pas : ta phrase de récupération, tes clés privées, ton code PIN, ni aucune donnée d'identification personnelle. Il n'y a pas de compte à créer. Aucune analytique publicitaire ni pistage n'est intégré à l'application.`,
  },
  {
    title: '3. Données traitées localement',
    body: `Restent sur ton appareil : le coffre chiffré (phrase), tes adresses publiques, contacts, réseaux personnalisés, favoris et historique du navigateur, sessions de connexion aux dApps (WalletConnect, TON Connect), préférences, cache des soldes et de l'historique, et le journal de notifications. Tu peux tout effacer en réinitialisant l'application.`,
  },
  {
    title: '4. Services tiers appelés par l\'app',
    body: `Pour afficher tes soldes, ton historique ou exécuter une opération, l'application interroge des services tiers. Ils reçoivent ton adresse IP et des données PUBLIQUES de blockchain (adresses, contrats, transactions) — jamais tes clés :
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
Ces services ont leurs propres politiques de confidentialité. Le navigateur dApps intégré charge des sites tiers qui, eux aussi, appliquent leurs propres règles.`,
  },
  {
    title: '5. Notifications',
    body: `Les notifications sont locales (générées sur l'appareil). Aucun serveur de notifications push n'est utilisé, donc aucun identifiant de push n'est transmis.`,
  },
  {
    title: '6. Sécurité',
    body: `La phrase est chiffrée en AES-256-GCM avec une clé dérivée de ton PIN (scrypt), puis rangée dans le stockage sécurisé du système (Keychain iOS / Keystore Android). Verrouillage automatique, écran de garde et anti-brute-force protègent l'accès. Aucun système n'est infaillible : garde ta phrase de récupération hors ligne.`,
  },
  {
    title: '7. Enfants',
    body: `Kalyx Wallet n'est pas destiné aux personnes de moins de 16 ans.`,
  },
  {
    title: '8. Modifications & contact',
    body: `Cette politique peut évoluer ; la date de mise à jour ci-dessus fait foi. Pour toute question : ${LEGAL_CONTACT}.`,
  },
];

export const TERMS: LegalSection[] = [
  {
    title: '1. Version bêta',
    body: `Kalyx Wallet est actuellement en phase de test (bêta). Le logiciel peut contenir des bugs. N'y conserve pas de sommes importantes et privilégie les réseaux de test ou de petits montants tant que la version stable et l'audit de sécurité ne sont pas publiés.`,
  },
  {
    title: '2. Tu es seul responsable de tes clés',
    body: `Kalyx est non-custodial : TU es seul détenteur et responsable de ta phrase de récupération. Si tu la perds, personne — ni toi, ni l'éditeur — ne pourra restaurer l'accès à tes fonds. Ne la partage avec personne, ne la stocke pas en ligne.`,
  },
  {
    title: '3. Risques liés aux crypto-actifs',
    body: `Les crypto-actifs sont volatils et les transactions sur blockchain sont IRRÉVERSIBLES. Une erreur d'adresse, de réseau ou une signature accordée à un contrat malveillant peut entraîner une perte définitive. Ne copie jamais une adresse depuis ton historique : des escrocs y glissent des adresses sosies (empoisonnement d'adresse). Les outils d'analyse (GoPlus, anti-phishing, filtre anti-spam, détection des sosies) réduisent le risque sans le supprimer.`,
  },
  {
    title: '4. Aucune garantie',
    body: `L'application est fournie « en l'état », sans garantie d'aucune sorte. Dans les limites permises par la loi, ${LEGAL_PUBLISHER} décline toute responsabilité pour les pertes de fonds, bugs, indisponibilités de réseau, ou actes de services et sites tiers (swap, bridge, staking, dApps, paiements marchands).`,
  },
  {
    title: '5. Services tiers',
    body: `Les échanges, bridges, protocoles de staking et de rendement, dApps et paiements marchands sont opérés par des tiers indépendants. Kalyx ne fait que faciliter l'interaction ; il n'endosse pas et ne contrôle pas ces services.`,
  },
  {
    title: '6. Pas de conseil financier',
    body: `Kalyx ne fournit aucun conseil en investissement. Les rendements affichés (Earn, staking) sont ceux annoncés par les protocoles, variables et non garantis. Tu es responsable du respect des lois et obligations fiscales de ton pays de résidence.`,
  },
  {
    title: '7. Modifications & droit applicable',
    body: `Ces conditions peuvent être modifiées. Le droit applicable est le droit ${LEGAL_COUNTRY === 'France' ? 'français' : `de ${LEGAL_COUNTRY}`}. Pour toute question : ${LEGAL_CONTACT}.`,
  },
];

/* ── English (served to every non-French language; the French text prevails) ── */

export const PRIVACY_EN: LegalSection[] = [
  {
    title: '1. The principle: non-custodial',
    body: `Kalyx Wallet is a non-custodial wallet. Your private keys and recovery phrase are generated and stored ONLY on your phone, encrypted. They are never sent to ${LEGAL_PUBLISHER} or to any server. We have no access to your funds or your phrase.`,
  },
  {
    title: '2. What we do not collect',
    body: `We do not collect your recovery phrase, private keys, PIN, or any personally identifying data. There is no account to create. No advertising analytics or tracking is built into the app.`,
  },
  {
    title: '3. Data processed locally',
    body: `The following stay on your device: the encrypted vault (phrase), your public addresses, contacts, custom networks, browser bookmarks and history, dApp connection sessions (WalletConnect, TON Connect), preferences, balance and history cache, and the notification log. You can erase everything by resetting the app.`,
  },
  {
    title: '4. Third-party services used by the app',
    body: `To show your balances and history or to carry out an operation, the app queries third-party services. They receive your IP address and PUBLIC blockchain data (addresses, contracts, transactions) — never your keys:
• Alchemy, public RPC nodes (PublicNode, dRPC…) — balances, tokens, NFTs, history and transaction broadcast (EVM)
• Ankr, Etherscan — transaction history (EVM), as fallbacks
• Helius, public Solana RPC — balances, NFTs and history (Solana)
• mempool.space — balances, fees and history (Bitcoin)
• TonAPI and TON Center — balances, jettons, NFTs, .ton names, simulation and broadcast (TON). TonAPI requests go through a relay run by the publisher (Cloudflare Workers): it sees your IP address and TON addresses, keeps no record of them, and caches public responses for one minute only
• DefiLlama, CoinGecko, Frankfurter — crypto prices and exchange rates
• LI.FI, Relay — swap and bridge quotes; Jupiter — swaps on Solana; Tonstakers — TON staking
• WalletConnect (Reown) — dApp connections, domain verification (Verify) and merchant payments (WalletConnect Pay)
• TON Connect bridges (TON Foundation, Tonkeeper) — end-to-end encrypted messages between the wallet and a TON dApp
• GoPlus — security analysis (contracts, tokens, sites)
• wsrv.nl — converting NFT images into a displayable format
• Google Drive — only if you choose the Drive backup: a file encrypted on the device, placed in the app's private folder, access revoked right after
• The AI provider of your choice — only if you enable the Copilot with your own key: balances, network and masked activity, never your addresses or keys
• Google / DuckDuckGo — browser site icons (favicons)
These services have their own privacy policies. The built-in dApp browser loads third-party sites, which also apply their own rules.`,
  },
  {
    title: '5. Notifications',
    body: `Notifications are local (generated on the device). No push notification server is used, so no push identifier is transmitted.`,
  },
  {
    title: '6. Security',
    body: `The phrase is encrypted with AES-256-GCM using a key derived from your PIN (scrypt), then kept in the system's secure storage (iOS Keychain / Android Keystore). Auto-lock, a privacy screen and anti-brute-force protect access. No system is infallible: keep your recovery phrase offline.`,
  },
  {
    title: '7. Children',
    body: `Kalyx Wallet is not intended for people under 16.`,
  },
  {
    title: '8. Changes & contact',
    body: `This policy may change; the update date above prevails. For any question: ${LEGAL_CONTACT_EN}.`,
  },
];

export const TERMS_EN: LegalSection[] = [
  {
    title: '1. Beta version',
    body: `Kalyx Wallet is currently in testing (beta). The software may contain bugs. Do not keep large amounts in it, and prefer test networks or small amounts until the stable version and the security audit are published.`,
  },
  {
    title: '2. You alone are responsible for your keys',
    body: `Kalyx is non-custodial: YOU alone hold and are responsible for your recovery phrase. If you lose it, no one — neither you nor the publisher — can restore access to your funds. Never share it, never store it online.`,
  },
  {
    title: '3. Crypto-asset risks',
    body: `Crypto-assets are volatile and blockchain transactions are IRREVERSIBLE. A wrong address, a wrong network or a signature granted to a malicious contract can cause a permanent loss. Never copy an address from your history: scammers slip look-alike addresses into it (address poisoning). Analysis tools (GoPlus, anti-phishing, spam filter, look-alike detection) reduce the risk without removing it.`,
  },
  {
    title: '4. No warranty',
    body: `The app is provided "as is", without warranty of any kind. To the extent permitted by law, ${LEGAL_PUBLISHER} accepts no liability for loss of funds, bugs, network outages, or acts of third-party services and sites (swap, bridge, staking, dApps, merchant payments).`,
  },
  {
    title: '5. Third-party services',
    body: `Swaps, bridges, staking and yield protocols, dApps and merchant payments are run by independent third parties. Kalyx only facilitates the interaction; it neither endorses nor controls these services.`,
  },
  {
    title: '6. No financial advice',
    body: `Kalyx provides no investment advice. Displayed yields (Earn, staking) are those announced by the protocols, variable and not guaranteed. You are responsible for complying with the laws and tax obligations of your country of residence.`,
  },
  {
    title: '7. Changes & governing law',
    body: `These terms may change. They are governed by French law. For any question: ${LEGAL_CONTACT_EN}.`,
  },
];

/** Textes à montrer pour une langue : le français fait foi, l'anglais sert partout ailleurs. */
export function legalFor(lang: string): { privacy: LegalSection[]; terms: LegalSection[]; updated: string } {
  return lang === 'fr'
    ? { privacy: PRIVACY, terms: TERMS, updated: LEGAL_UPDATED }
    : { privacy: PRIVACY_EN, terms: TERMS_EN, updated: LEGAL_UPDATED_EN };
}
