import React from 'react';
import { Lock, EyeOff, Fingerprint, ShieldAlert, ScanSearch, LifeBuoy } from 'lucide-react';
import { Reveal } from './Reveal';

/**
 * Chaque pilier décrit une fonctionnalité RÉELLEMENT implémentée (vérifié le
 * 2026-09-14 dans le code de l'app) : ne rien ajouter ici sans le code en face.
 *  - vault.ts : AES-256-GCM, clé dérivée du PIN par scrypt, expo-secure-store.
 *  - package.json : aucun SDK d'analyse/publicité.
 *  - lib/biometrics.ts, src/security/pin.ts (délai croissant), ui/PrivacyScreen,
 *    expo-screen-capture sur create/reveal.
 *  - src/domain/tx/simulate.ts (Alchemy), src/domain/security/goplus.ts,
 *    src/domain/wc/explain.ts (Verify) — branchés dans WalletConnect + navigateur.
 *  - src/domain/validation/poisoning.ts — bloquant dans app/send.tsx.
 *  - lib/telegramSupport.ts — tickets KX, envoi bloqué si secret détecté.
 */
const pillars = [
  {
    icon: Lock,
    title: 'Un coffre chiffré',
    text: 'Ta phrase est chiffrée en AES-256-GCM avec une clé dérivée de ton PIN (scrypt), puis rangée dans le stockage sécurisé du système : Keychain sur iOS, Keystore sur Android.',
  },
  {
    icon: EyeOff,
    title: 'Zéro compte, zéro traçage',
    text: 'Pas d’e-mail, pas d’identifiant, aucun SDK d’analyse ni de publicité. Kalyx n’a pas de serveur : l’app parle directement aux réseaux.',
  },
  {
    icon: Fingerprint,
    title: 'Biométrie et PIN',
    text: 'Empreinte ou visage, un PIN maison, et un délai qui s’allonge après chaque mauvais code. L’app se floute dans les applis récentes ; la capture d’écran est bloquée quand ta phrase s’affiche.',
  },
  {
    icon: ShieldAlert,
    title: 'Simulation avant signature',
    text: 'Une dApp te demande de signer ? Kalyx simule le résultat (« tu perds, tu reçois »), vérifie le contrat et le site via GoPlus, et confirme le domaine avec WalletConnect Verify.',
  },
  {
    icon: ScanSearch,
    title: 'Empoisonnement d’adresse bloqué',
    text: 'Avant un envoi, le destinataire est comparé à tes adresses connues. Un sosie (même début, même fin, milieu différent) est bloqué, pas seulement signalé.',
  },
  {
    icon: LifeBuoy,
    title: 'Un support sans fuite',
    text: 'En cas de problème, un ticket de diagnostic horodaté (KX-…) est généré. S’il contient un secret, l’envoi est bloqué avant de partir.',
  },
];

export function SecuritySection() {
  return (
    <section id="security" data-halo="security" className="scroll-mt-16 px-5 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-page">
        <Reveal className="max-w-2xl">
          <p className="mb-4 inline-flex rounded-chip border border-trait bg-nuit/60 px-3 py-1.5 text-xs font-medium text-brume">
            Sécurité visible
          </p>
          <h2 className="text-3xl font-semibold leading-none tracking-[-0.03em] text-lueur sm:text-5xl">
            Tu vois ce que tu signes.
          </h2>
          <p className="mt-4 text-base text-brume sm:text-lg">
            Dans la finance décentralisée, une erreur ne pardonne pas. Kalyx explique chaque demande en français clair,
            et bloque ce qui doit l’être.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <article className="h-full rounded-container bg-nuit p-6 ring-1 ring-trait transition-colors duration-150 hover:bg-orbite sm:p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-input bg-orbite text-lueur">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.01em] text-lueur">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-brume">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
