import type { LegalSection } from '../components/legal-page';

/** Texte juridique, en français (fait foi). */
export const sections: LegalSection[] = [
  {
    id: 'beta',
    title: '1. Phase de version bêta & tests',
    body: `Kalyx Wallet est actuellement en phase de test et d'amélioration continue (version bêta). Bien que conçue selon les standards de sécurité les plus stricts, l'application peut contenir des anomalies logicielles imprévues.
Il est fortement recommandé de ne pas y stocker des montants disproportionnés et d'effectuer vos premiers tests sur des réseaux de test (testnets) ou avec des sommes modérées tant qu'une version finalisée et les rapports d'audits formels ne sont pas rendus publics.`,
  },
  {
    id: 'responsabilite',
    title: '2. Responsabilité exclusive de vos clés privées',
    body: `Kalyx Wallet est une application strictement non-custodial : VOUS êtes le seul et unique détenteur de votre phrase de récupération secrète (seed phrase) et de vos clés privées.
Si vous égarez votre phrase secrète, personne — ni l'éditeur (KALYX / Ahamed Signate), ni aucun support technique — n'a le pouvoir technique de restaurer l'accès à votre portefeuille ou de récupérer vos fonds.
Il est formellement déconseillé de prendre une capture d'écran de votre phrase, de l'enregistrer dans un gestionnaire de cloud ou de la transmettre à un tiers sous quelque prétexte que ce soit.`,
  },
  {
    id: 'risques',
    title: '3. Risques inhérents aux crypto-actifs & irréversibilité',
    body: `L'utilisation des technologies de registres distribués (blockchains) comporte des risques significatifs :
• Volatilité : Le cours des actifs numériques fluctue de manière imprévisible.
• Irréversibilité : Une fois validée par les validateurs d'un réseau, une transaction blockchain ne peut être ni annulée, ni modifiée, ni remboursée.
• Erreurs de saisie : Tout envoi vers une mauvaise adresse ou sur un réseau incompatible peut entraîner la perte irrémédiable de l'actif concerné.
• Smart contracts malveillants : Bien que Kalyx intègre des vérifications avant signature (GoPlus Security, simulation Alchemy, WalletConnect Verify) pour inspecter les adresses, contrats et sites, aucune analyse préventive ne peut garantir l'absence totale de vulnérabilités sur les protocoles tiers.`,
  },
  {
    id: 'garantie',
    title: '4. Absence de garantie (« En l\'état »)',
    body: `L'application est fournie « en l'état » (as-is), sans garantie expresse ou implicite d'aucune sorte quant à sa disponibilité continue, son adéquation à un usage particulier ou l'absence d'erreurs.
Dans toute la mesure permise par le droit applicable, KALYX (Entreprise individuelle de Ahamed Signate) décline toute responsabilité pour toute perte financière directe ou indirecte découlant d'une défaillance du réseau blockchain, d'un bug de protocole, d'une congestion de réseau ou d'un piratage résultant d'une négligence dans la garde des clés privées.`,
  },
  {
    id: 'tiers',
    title: '5. Services & Protocoles tiers décentralisés',
    body: `Les échanges de jetons (swaps), ponts inter-chaînes (bridges) et dApps accessibles via le navigateur intégré sont exécutés par des tiers et des contrats intelligents autonomes (notamment le protocole d'agrégation LI.FI, Uniswap, Raydium, etc.).
Kalyx Wallet n'agit qu'en tant qu'interface cliente facilitant la signature locale par l'utilisateur. Kalyx ne contrôle pas, n'administre pas et n'endosse pas les services tiers ainsi contactés.`,
  },
  {
    id: 'conseil',
    title: '6. Absence de conseil financier ou d\'investissement',
    body: `Aucun contenu, notification, cours de prix ou devis affiché dans l'application Kalyx Wallet ne constitue un conseil en investissement, une recommandation financière ou une incitation à négocier des crypto-actifs.
Vous demeurez seul responsable du respect des obligations légales, réglementaires et fiscales en vigueur dans votre juridiction de résidence fiscale.`,
  },
  {
    id: 'droit',
    title: '7. Droit applicable & Juridiction compétente',
    body: `Les présentes conditions sont régies et interprétées conformément au droit français. Tout litige relatif à leur interprétation ou à leur exécution fera l'objet d'une tentative de résolution amiable préalable avant toute saisine des tribunaux compétents du ressort de la cour d'appel compétente.`,
  },
  {
    id: 'editeur',
    title: '8. Mentions légales & Coordonnées',
    body: `Éditeur : KALYX (Ahamed Signate)
Statut légal : Entrepreneur individuel
SIREN : 130 046 865 — Code APE : 62.01Z
Contact assistance & conformité : support@kalyxwallet.com
Canal officiel Telegram : https://t.me/kalyxntw
Le détail complet de ces mentions (éditeur, hébergeur) figure sur la page dédiée « Mentions légales ».`,
  },
];
