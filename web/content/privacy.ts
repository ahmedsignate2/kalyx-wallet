import type { LegalSection } from '../components/legal-page';

/** Texte juridique, en français (fait foi). */
export const sections: LegalSection[] = [
  {
    id: 'principe',
    title: '1. Le principe : 100% non-custodial',
    body: `Kalyx Wallet est un portefeuille non-custodial. Vos clés privées et votre phrase de récupération sont générées et stockées UNIQUEMENT sur votre téléphone, chiffrées de bout en bout. Elles ne sont JAMAIS envoyées à KALYX (Entreprise individuelle de Ahamed Signate), ni à aucun serveur distant ou intermédiaire. Nous n'avons strictement aucun accès technique à vos fonds ni à votre phrase secrète.`,
  },
  {
    id: 'collecte',
    title: '2. Ce que nous ne collectons pas',
    body: `Nous ne collectons aucune des données suivantes :
• Votre phrase de récupération (12 ou 24 mots)
• Vos clés privées et signatures
• Votre code PIN ou identifiant biométrique
• Aucune donnée d'identification personnelle (nom, adresse, numéro de téléphone, e-mail)
Il n'y a aucun compte utilisateur à créer. Aucune régie publicitaire ni traceur analytique n'est présent dans le code de l'application.`,
  },
  {
    id: 'local',
    title: '3. Données traitées exclusivement en local',
    body: `Toutes les données suivantes demeurent confinées sur votre appareil personnel :
• Le coffre chiffré contenant vos clés privées
• Le carnet d'adresses et les contacts locaux
• La liste des réseaux personnalisés ajoutés
• L'historique de navigation dApps et les favoris
• Les préférences d'affichage et la devise de référence
• Le journal local des transactions et notifications
Vous pouvez à tout moment effacer l'intégralité de ces données en désinstallant ou réinitialisant l'application.`,
  },
  {
    id: 'tiers',
    title: '4. Services tiers sollicités par l\'application',
    body: `Lors de l'utilisation de certaines fonctionnalités blockchain, l'application interroge des services décentralisés ou APIs tierces qui reçoivent votre adresse IP et les requêtes publiques requises par les nœuds :
• Alchemy & Nœuds RPC publics — consultation des soldes, tokens et NFTs
• Etherscan / Explorateurs d'adresses — consultation de l'historique public de la blockchain
• CoinGecko — cotation et flux de prix du marché
• LI.FI — calcul des devis de swap et de bridge multi-chaînes
• WalletConnect (Reown) — relais de messages cryptés avec les applications décentralisées (dApps)
• GoPlus Security — analyse préventive des contrats, tokens et sites avant signature
• Alchemy (simulation) — estimation du résultat d'une transaction demandée par une dApp avant signature
• DuckDuckGo / Google Favicons — affichage des icônes de dApps dans le navigateur
• Google Drive — uniquement si vous activez la sauvegarde Google Drive : un fichier chiffré sur votre appareil (scrypt + AES-256-GCM) est déposé dans le dossier privé de l'application ; l'accès est révoqué immédiatement après l'opération et aucun jeton n'est conservé
• Fournisseur d'IA de votre choix (Copilot, clé personnelle) — uniquement si vous l'activez : soldes, réseau actif et activité récente masquée ; jamais vos adresses, clés ou phrase de récupération
Chacun de ces tiers applique sa propre politique de confidentialité. Le navigateur Web3 intégré permet d'accéder à des dApps autonomes appliquant leurs propres règles d'usage.`,
  },
  {
    id: 'notifications',
    title: '5. Notifications & alertes',
    body: `Toutes les notifications générées par Kalyx Wallet sont strictement locales (générées au niveau du système d'exploitation de votre téléphone). Aucun serveur distant de notification push n'est sollicité, ce qui garantit qu'aucun jeton d'appareil (device push token) n'est jamais transmis à un tiers.`,
  },
  {
    id: 'securite',
    title: '6. Mesures de sécurité cryptographiques',
    body: `La phrase de récupération est chiffrée en AES-256-GCM avec une clé dérivée de votre code PIN (scrypt), puis stockée dans le stockage sécurisé du système (Keychain iOS / Keystore Android).
L'application dispose d'un verrouillage automatique dès la mise en veille, d'un écran de garde anti-capture d'écran et d'un ralentisseur anti brute-force sur le code PIN.
Bien que ces défenses soient à l'état de l'art, aucun système informatique n'est inviolable : il est impératif de conserver votre phrase de récupération écrite sur papier hors ligne.`,
  },
  {
    id: 'mineurs',
    title: '7. Protection des mineurs',
    body: `L'application Kalyx Wallet n'est pas destinée aux personnes de moins de 16 ans. Nous ne sollicitons ni ne conservons sciemment aucune information relative à des mineurs.`,
  },
  {
    id: 'hosting',
    title: '8. Mentions légales & Hébergement (LCEN)',
    body: `Conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN) :
• Éditeur : KALYX (Ahamed Signate)
• Statut : Entrepreneur individuel
• SIREN : 130 046 865 — Code APE : 62.01Z
• Courriel de contact : support@kalyxwallet.com
• Hébergement du site kalyxwallet.com : Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA
• Hébergement de l'application : application mobile non-custodial exécutée localement sur l'appareil de l'utilisateur, ne nécessitant aucun serveur central de stockage de clés ou de base de données d'utilisateurs.
Le détail complet de ces mentions figure sur la page dédiée « Mentions légales ».`,
  },
  {
    id: 'contact',
    title: '9. Évolution de la politique & Contact',
    body: `La présente politique de confidentialité peut être révisée pour refléter l'évolution des fonctionnalités ou du cadre réglementaire. La date de mise à jour fait foi. Pour toute demande relative à la protection des données ou pour signaler un problème de sécurité : support@kalyxwallet.com ou sur Telegram @kalyxntw.`,
  },
];
