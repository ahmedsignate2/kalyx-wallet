'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChapterHead } from './chapter';
import { EASE } from './motion';

/*
 * Vraies captures de l'app (docs/screenshots) et vrais chiffres :
 *  - 63 réseaux = 67 configs dans src/domain/chains/configs.ts − 4 testnets
 *  - Envoyer en 4 étapes : app/send.tsx (StepBar), maintien 1,2 s (durations.holdToSend)
 *  - Swap : Jupiter (Solana), LI.FI et Relay (EVM, cross-chain) — src/domain/swap
 *  - Earn : 6 protocoles — src/domain/earn/catalog.ts ; 0 % de frais (EARN_FEE)
 */
const steps = [
  {
    screen: '/screens/home.jpg',
    title: 'Un solde. Toutes vos chaînes.',
    text: 'Bitcoin, Ethereum et ses Layer 2, Solana : 63 réseaux agrégés en un seul chiffre, une seule courbe. Le solde s’affiche depuis le cache avant même que le réseau réponde.',
    stat: { value: '63', label: 'réseaux' },
  },
  {
    screen: '/screens/send.jpg',
    title: 'Envoyer, en quatre gestes.',
    text: 'Le destinataire, le montant, le récapitulatif, puis vous maintenez le doigt 1,2 seconde. Le montant est converti en euros, les frais aussi, et « votre solde passera de A à B » est écrit noir sur blanc.',
    stat: { value: '1,2 s', label: 'de maintien pour envoyer' },
  },
  {
    screen: '/screens/swap.jpg',
    title: 'Échanger sans quitter l’app.',
    text: 'Jupiter sur Solana, LI.FI et Relay sur les chaînes EVM et d’une chaîne à l’autre. La route est écrite en une phrase, l’impact sur le prix est annoncé avant de confirmer.',
    stat: { value: '3', label: 'routeurs, vous signez vous-même' },
  },
  {
    screen: '/screens/earn.jpg',
    title: 'Faire travailler ce qui dort.',
    text: 'Aave v3, Lido, Rocket Pool, Benqi, Jito, Marinade. Vous déposez depuis votre wallet, vous retirez quand vous voulez. Kalyx ne prend rien au passage.',
    stat: { value: '0 %', label: 'de frais Kalyx sur Earn' },
  },
  {
    screen: '/screens/browser.jpg',
    title: 'Les dApps, avec un garde du corps.',
    text: 'Un navigateur intégré, une liste de dApps vérifiées, et chaque demande de signature traduite en une phrase avant que vous ne la donniez.',
    stat: { value: '1', label: 'phrase par signature' },
  },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  return (
    <section id="fonctionnement" className="scroll-mt-16 bg-ink px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="I"
          kicker="Comment ça marche"
          title={
            <>
              Un wallet, <em className="italic text-sage">pas un labyrinthe.</em>
            </>
          }
          lead="Cinq écrans de l’application, tels qu’ils sont aujourd’hui. Pas de maquette : ce sont de vraies captures."
        />

        <div className="mt-20 grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          {/* Le téléphone reste à l'écran ; son écran change avec le texte lu. */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <div className="relative mx-auto w-80">
                <div className="relative aspect-[9/19.2] rounded-[2.6rem] border border-bone/15 bg-ink-3 p-[6px] shadow-phone">
                  <div className="absolute left-1/2 top-3 z-20 h-[22px] w-[88px] -translate-x-1/2 rounded-full bg-ink" />
                  <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-ink-2">
                    <AnimatePresence initial={false}>
                      <motion.div
                        key={steps[active].screen}
                        className="absolute inset-0"
                        initial={reduce ? false : { opacity: 0, scale: 1.03 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? undefined : { opacity: 0 }}
                        transition={{ duration: 0.7, ease: EASE }}
                      >
                        <Image src={steps[active].screen} alt="" fill sizes="320px" className="object-cover object-top" />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
              <p className="mt-6 text-center font-display text-sm italic text-mist">
                {active + 1} / {steps.length} — {steps[active].title}
              </p>
            </div>
          </div>

          <ol className="space-y-24 lg:space-y-[40vh] lg:py-[20vh]">
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.9, ease: EASE }}
                className="relative grid gap-6"
              >
                {/* Sentinelle : quand elle traverse le centre de l'écran, cet écran devient actif. */}
                <motion.span aria-hidden className="absolute left-0 top-1/2 h-px w-px" onViewportEnter={() => setActive(i)} viewport={{ margin: '-45% 0px -45% 0px' }} />
                {/* Sur mobile, chaque étape montre sa capture. */}
                <div className="relative mx-auto aspect-[9/19.2] w-56 overflow-hidden rounded-[1.8rem] border border-bone/15 shadow-phone lg:hidden">
                  <Image src={s.screen} alt={s.title} fill sizes="224px" className="object-cover object-top" />
                </div>
                <div>
                  <p className="font-display text-sm text-sage">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-2 font-display text-3xl leading-tight text-paper sm:text-4xl">{s.title}</h3>
                  <p className="mt-4 max-w-md text-base font-light leading-relaxed text-mist">{s.text}</p>
                  <p className="mt-6 flex items-baseline gap-3">
                    <span className="font-display text-4xl text-paper">{s.stat.value}</span>
                    <span className="text-sm text-mist">{s.stat.label}</span>
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
