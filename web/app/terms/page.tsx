import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { FileText, ArrowLeft, Mail, Calendar, Scale, AlertTriangle, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: "Conditions Générales d'Utilisation — Kalyx Wallet",
  description: "Conditions générales d'utilisation régissant l'usage de l'application mobile et des services Kalyx Wallet.",
};

export default function TermsPage() {
  const sections = [
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
• Smart contracts malveillants : Bien que Kalyx intègre un bouclier anti-drainer (GoPlus Security & Helius) pour inspecter les adresses et simulations, aucune analyse préventive ne peut garantir l'absence totale de vulnérabilités sur les protocoles tiers.`,
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
      body: `Éditeur : KALYX (Entreprise individuelle de Ahamed Signate)
Statut légal : Entrepreneur individuel
SIRET : En cours d'attribution INSEE
Contact assistance & conformité : support@kalyxwallet.com
Canal officiel Telegram : https://t.me/kalyxntw`,
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
              <Scale className="w-6 h-6" />
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              Conditions Générales d&apos;Utilisation
            </h1>

            <p className="text-slate-300 text-base leading-relaxed mb-6">
              Veuillez lire attentivement les présentes conditions avant d&apos;utiliser l&apos;application Kalyx Wallet. Elles définissent le cadre d&apos;utilisation responsable et les spécificités du modèle non-custodial.
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 border-t border-border pt-6">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan" />
                <span>Dernière révision : 5 juillet 2026</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Version Bêta</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Modèle Non-Custodial</span>
              </div>
            </div>
          </div>

          {/* Table of contents */}
          <div className="rounded-2xl glass-panel p-6 mb-12 border-border/80">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
              Sommaire des articles
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
                Besoin d&apos;éclaircissements juridiques ou techniques ?
              </h4>
              <p className="text-slate-400 text-sm">
                Consultez notre équipe d&apos;assistance ou écrivez-nous pour toute question relative aux conditions.
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
