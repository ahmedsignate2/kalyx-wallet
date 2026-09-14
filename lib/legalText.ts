/**
 * Textes légaux (source unique) : rendus dans l'écran Légal in-app ET recopiés
 * dans PRIVACY.md / TERMS.md pour hébergement (URL requise par le Play Store).
 *
 * ⚠️ BROUILLONS à faire relire par un juriste avant une mise en production
 * réelle avec de vrais fonds.
 */
import { LEGAL_CONSTANTS } from '../src/constants/legal';

export const LEGAL_UPDATED = '5 juillet 2026';
export const LEGAL_PUBLISHER = LEGAL_CONSTANTS.COMPANY_NAME;
export const LEGAL_COUNTRY = 'France';
export const LEGAL_CONTACT = `${LEGAL_CONSTANTS.CONTACT_EMAIL} ou Telegram @kalyxntw (${LEGAL_CONSTANTS.TELEGRAM_URL})`;

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
    body: `Restent sur ton appareil : le coffre chiffré (phrase), tes adresses publiques, contacts, réseaux personnalisés, favoris et historique du navigateur, préférences, et le journal de notifications. Tu peux tout effacer en réinitialisant l'application.`,
  },
  {
    title: '4. Services tiers appelés par l\'app',
    body: `Quand tu utilises certaines fonctions, l'application interroge des services tiers qui reçoivent alors ton adresse IP et des données publiques (adresses de blockchain, contrats, requêtes) :
• Alchemy — RPC, soldes, tokens, NFT
• Etherscan — historique des transactions
• CoinGecko — prix des cryptos
• LI.FI, Relay — devis de swap et bridge (EVM) ; Jupiter — swap sur Solana
• WalletConnect (Reown) — connexion aux dApps et vérification du domaine (Verify)
• GoPlus — analyse de sécurité (contrats, tokens, sites)
• Alchemy (simulation) — estimation du résultat d'une transaction demandée par une dApp
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
    body: `Les crypto-actifs sont volatils et les transactions sur blockchain sont IRRÉVERSIBLES. Une erreur d'adresse, de réseau ou une signature accordée à un contrat malveillant peut entraîner une perte définitive. Les outils d'analyse (GoPlus, anti-phishing) réduisent le risque sans le supprimer.`,
  },
  {
    title: '4. Aucune garantie',
    body: `L'application est fournie « en l'état », sans garantie d'aucune sorte. Dans les limites permises par la loi, ${LEGAL_PUBLISHER} décline toute responsabilité pour les pertes de fonds, bugs, indisponibilités de réseau, ou actes de services et sites tiers (swap, bridge, dApps).`,
  },
  {
    title: '5. Services tiers',
    body: `Les échanges, bridges et dApps sont opérés par des tiers indépendants. Kalyx ne fait que faciliter l'interaction ; il n'endosse pas et ne contrôle pas ces services.`,
  },
  {
    title: '6. Pas de conseil financier',
    body: `Kalyx ne fournit aucun conseil en investissement. Tu es responsable du respect des lois et obligations fiscales de ton pays de résidence.`,
  },
  {
    title: '7. Modifications & droit applicable',
    body: `Ces conditions peuvent être modifiées. Le droit applicable est le droit ${LEGAL_COUNTRY === 'France' ? 'français' : `de ${LEGAL_COUNTRY}`}. Pour toute question : ${LEGAL_CONTACT}.`,
  },
];
