import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { Shield, ArrowLeft, Mail, FileText, Calendar, Building, Globe } from 'lucide-react';

export const metadata = {
  title: 'Politique de Confidentialité — Kalyx Wallet',
  description: 'Politique de confidentialité et protection des données personnelles de Kalyx Wallet, portefeuille non-custodial.',
};

export default function PrivacyPage() {
  const sections = [
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
• GoPlus Security & Helius — analyse préventive de sécurité des contrats et détection d'adresses malveillantes
• DuckDuckGo / Google Favicons — affichage des icônes de dApps dans le navigateur
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
      body: `La phrase de récupération est chiffrée selon le standard militaire AES-256-GCM sous votre code PIN et stockée dans l'enclave sécurisée matérielle (iOS Keychain / Android Keystore).
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
• Éditeur : KALYX (Entreprise individuelle de Ahamed Signate)
• Statut : Entrepreneur individuel
• SIRET : En cours d'attribution INSEE
• Siège social : France
• Courriel de contact : support@kalyxwallet.com
• Hébergement de l'application : Application mobile non-custodial exécutée localement sur l'appareil de l'utilisateur, ne nécessitant aucun serveur central de stockage de clés ou de base de données d'utilisateurs.`,
    },
    {
      id: 'contact',
      title: '9. Évolution de la politique & Contact',
      body: `La présente politique de confidentialité peut être révisée pour refléter l'évolution des fonctionnalités ou du cadre réglementaire. La date de mise à jour fait foi. Pour toute demande relative à la protection des données ou pour signaler un problème de sécurité : support@kalyxwallet.com ou sur Telegram @kalyxntw.`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100 selection:bg-primary/30 selection:text-white">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb / Back */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour à l&apos;accueil</span>
          </Link>

          {/* Header Card */}
          <div className="rounded-3xl glass-panel p-8 sm:p-10 border-border mb-12 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary-light flex items-center justify-center mb-6 border border-primary/30">
              <Shield className="w-6 h-6" />
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              Politique de Confidentialité
            </h1>

            <p className="text-slate-300 text-base leading-relaxed mb-6">
              Chez Kalyx, votre vie privée n&apos;est pas une option, c&apos;est le fondement de notre architecture. Découvrez comment nous protégeons vos données en refusant catégoriquement de les collecter.
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 border-t border-border pt-6">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan" />
                <span>Dernière mise à jour : 5 juillet 2026</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building className="w-4 h-4 text-primary-light" />
                <span>KALYX (Ahamed Signate)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Droit Français & RGPD</span>
              </div>
            </div>
          </div>

          {/* Table of contents */}
          <div className="rounded-2xl glass-panel p-6 mb-12 border-border/80">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
              Sommaire
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {sections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="text-slate-400 hover:text-cyan transition-colors py-1 truncate"
                >
                  {sec.title}
                </a>
              ))}
            </div>
          </div>

          {/* Content sections */}
          <div className="space-y-8">
            {sections.map((sec) => (
              <div
                key={sec.id}
                id={sec.id}
                className="rounded-2xl glass-panel p-7 sm:p-8 border-border scroll-mt-28"
              >
                <h3 className="text-xl font-bold text-white mb-4">
                  {sec.title}
                </h3>
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-line space-y-2">
                  {sec.body}
                </div>
              </div>
            ))}
          </div>

          {/* Contact Support Box */}
          <div className="mt-12 rounded-3xl glass-panel p-8 border-primary/30 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="text-lg font-bold text-white mb-1">
                Une question sur la gestion de vos données ?
              </h4>
              <p className="text-slate-400 text-sm">
                Notre équipe est à votre disposition pour toute demande relative à la sécurité ou à la conformité.
              </p>
            </div>
            <a
              href="mailto:support@kalyxwallet.com"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-surface-hover hover:bg-surface-card border border-border text-white text-sm font-semibold transition-colors"
            >
              <Mail className="w-4 h-4 text-cyan" />
              <span>support@kalyxwallet.com</span>
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
