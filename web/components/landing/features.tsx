import React from 'react';
import { ArrowDownUp, Fingerprint, KeyRound, Layers, ShieldCheck, Unlock } from 'lucide-react';
import { Item, Reveal, Rule, Stagger } from './motion';

/*
 * Six promesses, chacune adossée au code de l'app (vérifié le 2026-09-14) :
 * src/security/vault.ts (AES-256-GCM + scrypt, expo-secure-store), src/domain/swap
 * (Jupiter, LI.FI), lib/biometrics.ts + src/security/pin.ts, package.json (aucun SDK
 * d'analyse). Pas de « chiffrement matériel » ni de « niveau militaire » : ce n'est pas
 * ce que fait l'app.
 */
const features = [
  {
    icon: KeyRound,
    title: 'Clés privées isolées',
    text: 'Votre phrase est chiffrée sur l’appareil puis rangée dans le Keystore Android ou le Keychain iOS. Elle ne transite par aucun serveur.',
  },
  {
    icon: Layers,
    title: 'Multi-chaînes unifié',
    text: 'Bitcoin, Ethereum, Solana et les Layer 2 dans une seule interface, avec un solde agrégé.',
  },
  {
    icon: ShieldCheck,
    title: 'Chiffrement AES-256-GCM',
    text: 'Clé dérivée de votre PIN par scrypt, chiffrement authentifié : un mauvais PIN ne déchiffre rien, et ne révèle rien.',
  },
  {
    icon: ArrowDownUp,
    title: 'Swaps intégrés',
    text: 'Échangez vos tokens via Jupiter et LI.FI, directement depuis le wallet, sans compte sur un exchange.',
  },
  {
    icon: Fingerprint,
    title: 'Accès biométrique',
    text: 'Déverrouillage par empreinte ou visage, PIN en secours, délai croissant après chaque mauvais code.',
  },
  {
    icon: Unlock,
    title: '100 % souverain',
    text: 'Zéro compte à créer, zéro KYC, aucun SDK d’analyse ni de publicité dans l’application.',
  },
];

export function Features() {
  return (
    <section id="fonctionnalites" className="scroll-mt-16 bg-ink px-5 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-page rounded-[2rem] bg-ink-2 p-6 sm:p-10 lg:p-14">
        <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-end">
          <div>
            <p className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-sage">
              <Rule className="w-8 bg-sage" />
              Acte II · Fonctionnalités
            </p>
            <Reveal as="h2" className="font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-paper sm:text-5xl">
              Un wallet complet, <em className="italic text-sage">sans intermédiaire.</em>
            </Reveal>
          </div>
          <Reveal as="p" delay={0.15} className="max-w-md text-base font-light leading-relaxed text-mist lg:justify-self-end">
            Tout ce qu’il faut pour détenir, envoyer et échanger, et rien qui vous demande de faire confiance à quelqu’un d’autre que vous.
          </Reveal>
        </div>

        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.07}>
          {features.map(({ icon: Icon, title, text }) => (
            <Item
              key={title}
              as="article"
              lift
              className="group rounded-2xl border border-bone/10 bg-ink-3 p-6 transition-colors duration-300 hover:border-sage/40"
            >
              <Icon className="h-6 w-6 text-sage transition-transform duration-300 ease-editorial group-hover:-translate-y-0.5" strokeWidth={1.5} />
              <h3 className="mt-7 text-lg font-medium text-paper">{title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-mist">{text}</p>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
