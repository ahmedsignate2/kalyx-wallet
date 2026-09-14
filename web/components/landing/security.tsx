import React from 'react';
import { Item, Reveal, Rule, Stagger } from './motion';

/**
 * Acte III, sur papier : le contraste éditorial de la page.
 * Chaque point décrit une fonctionnalité RÉELLEMENT implémentée (vérifié le 2026-09-14) :
 *  - src/security/vault.ts : AES-256-GCM, clé dérivée du PIN par scrypt ; expo-secure-store
 *    (Keystore Android / Keychain iOS).
 *  - package.json : aucun SDK d'analyse ou de publicité.
 *  - lib/biometrics.ts, src/security/pin.ts (délai croissant), ui/PrivacyScreen.tsx,
 *    expo-screen-capture sur les écrans de phrase.
 *  - src/domain/tx/simulate.ts (Alchemy), src/domain/security/goplus.ts,
 *    src/domain/wc/explain.ts (WalletConnect Verify) — WalletConnect + navigateur dApps.
 *  - src/domain/validation/poisoning.ts, bloquant dans app/send.tsx.
 *  - lib/telegramSupport.ts : tickets KX, envoi bloqué si secret détecté.
 */
const points = [
  {
    title: 'Un coffre chiffré, pas une promesse',
    text: 'Votre phrase de récupération est chiffrée en AES-256-GCM avec une clé dérivée de votre PIN par scrypt, puis rangée dans le Keystore Android ou le Keychain iOS. Un mauvais PIN ne déchiffre rien — et ne révèle rien.',
  },
  {
    title: 'Zéro compte, zéro télémétrie',
    text: 'Pas d’e-mail, pas de KYC, aucun SDK d’analyse ni de publicité. Kalyx n’a pas de serveur : l’application parle directement aux réseaux.',
  },
  {
    title: 'Biométrie, PIN et discrétion',
    text: 'Empreinte ou visage, PIN en secours, délai qui s’allonge après chaque mauvais code. L’app se floute dans les applications récentes et bloque la capture d’écran quand votre phrase est affichée.',
  },
  {
    title: 'Simulation avant signature',
    text: 'Quand une dApp demande une signature, Kalyx simule le résultat (« vous perdez, vous recevez »), interroge GoPlus sur le contrat et le site, et confirme le domaine avec WalletConnect Verify.',
  },
  {
    title: 'Empoisonnement d’adresse bloqué',
    text: 'Avant un envoi, le destinataire est comparé à vos adresses connues. Un sosie — même début, même fin, milieu différent — est bloqué, pas seulement signalé.',
  },
  {
    title: 'Un support sans fuite',
    text: 'En cas de problème, un ticket de diagnostic horodaté (KX-…) peut être généré. S’il contient un secret, l’envoi est bloqué avant de partir.',
  },
];

export function Security() {
  return (
    <section id="securite" className="scroll-mt-16 bg-paper px-5 py-20 text-ink sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <div className="grid gap-8 border-b border-ink/15 pb-12 lg:grid-cols-[1fr_1.2fr] lg:items-end">
          <div>
            <p className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-ink/60">
              <Rule className="w-8 bg-ink/40" />
              Acte III · Sécurité
            </p>
            <Reveal as="h2" className="font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
              Ce que l’application <em className="italic">fait vraiment.</em>
            </Reveal>
          </div>
          <Reveal as="p" delay={0.15} className="max-w-md text-base font-light leading-relaxed text-ink/70 lg:justify-self-end">
            Dans la finance décentralisée, une erreur ne pardonne pas. Chaque point ci-dessous correspond à du code livré dans l’app — rien de prévu, rien d’enjolivé.
          </Reveal>
        </div>

        <Stagger as="ol" className="grid gap-x-12 lg:grid-cols-2" gap={0.1}>
          {points.map((p, i) => (
            <Item key={p.title} as="li" className="relative grid grid-cols-[3rem_1fr] gap-4 py-8">
              <Rule className="absolute inset-x-0 bottom-0 bg-ink/10" delay={0.2} />
              <span className="font-display text-2xl text-ink/40">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="font-display text-2xl leading-tight">{p.title}</h3>
                <p className="mt-3 text-[15px] font-light leading-relaxed text-ink/75">{p.text}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
