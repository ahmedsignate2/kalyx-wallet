'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChapterHead } from './chapter';
import { Item, Stagger } from './motion';

/*
 * Vérifié dans le code :
 *  - app/backup.tsx : mots masqués tant que le doigt n'est pas maintenu, FLAG_SECURE, pas de copier.
 *  - app/verify.tsx + src/domain/wallet/backupChallenge.ts : 3 mots demandés, pose `backupVerified`.
 *  - src/domain/backup/cloudBackup.ts : fichier chiffré côté client (scrypt N=2^15 + AES-256-GCM),
 *    stocké où l'utilisateur veut, inutile sans le mot de passe.
 */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

const rituals = [
  {
    n: '01',
    title: 'Écrivez-la, à la main.',
    text: 'Au moment de la sauvegarde, les douze mots restent voilés tant que votre doigt n’est pas posé. La capture d’écran est bloquée, le copier-coller n’existe pas. Un stylo, un papier, un tiroir.',
  },
  {
    n: '02',
    title: 'Prouvez-la.',
    text: 'Kalyx vous demande trois mots, au hasard. Tant que vous ne les avez pas retrouvés, un bandeau reste sur l’accueil. Une phrase qu’on n’a jamais relue est une phrase qu’on n’a pas.',
  },
  {
    n: '03',
    title: 'Doublez-la, chiffrée.',
    text: 'Exportez un fichier chiffré sur l’appareil, avec un mot de passe de votre choix. Rangez-le où vous voulez — un cloud, un e-mail à vous-même. Sans le mot de passe, ce fichier ne vaut rien.',
  },
];

export function NeverLose() {
  const reduce = useReducedMotion();
  const [held, setHeld] = useState(false);

  return (
    <section id="perdre" className="scroll-mt-16 bg-paper px-5 py-24 text-ink sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          tone="paper"
          numeral="II"
          kicker="Ne jamais la perdre"
          title={
            <>
              Il n’y a pas de bouton <em className="italic">« mot de passe oublié ».</em>
            </>
          }
          lead="Personne ne peut vous rendre votre phrase — pas même nous. Alors l’application vous aide à ne pas la perdre, en trois gestes."
        />

        <div className="mt-20 grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-24">
          {/* Le papier : maintenir pour révéler, comme dans l'app. */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={held}
              aria-label="Maintenir pour révéler les mots d’exemple"
              onPointerDown={() => setHeld(true)}
              onPointerUp={() => setHeld(false)}
              onPointerLeave={() => setHeld(false)}
              onPointerCancel={() => setHeld(false)}
              onKeyDown={(e) => e.key === ' ' && setHeld(true)}
              onKeyUp={(e) => e.key === ' ' && setHeld(false)}
              className="select-none rounded-2xl border border-ink/15 bg-bone p-6 shadow-[0_24px_60px_-30px_rgba(8,10,9,0.35)] sm:p-8"
              style={{ touchAction: 'none' }}
            >
              <p className="mb-6 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-ink/60">
                Phrase de récupération
                <span className="font-display normal-case italic tracking-normal">exemple</span>
              </p>
              <ol className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
                {WORDS.map((w, i) => (
                  <li key={w} className="flex items-baseline gap-2 border-b border-ink/10 py-2.5">
                    <span className="w-5 font-display text-xs text-ink/40">{i + 1}</span>
                    <motion.span
                      className="font-display text-lg text-ink"
                      animate={reduce ? { filter: held ? 'blur(0px)' : 'blur(7px)' } : { filter: held ? 'blur(0px)' : 'blur(7px)', opacity: held ? 1 : 0.55 }}
                      transition={{ duration: 0.35, delay: held ? i * 0.03 : 0 }}
                    >
                      {w}
                    </motion.span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-center text-sm text-ink/60">
                {held ? 'Relâchez pour voiler.' : 'Maintenez le doigt pour révéler — comme dans l’app.'}
              </p>
            </div>
          </div>

          <Stagger as="ol" className="grid gap-12" gap={0.12}>
            {rituals.map((r) => (
              <Item key={r.n} as="li" className="grid grid-cols-[3rem_1fr] gap-4">
                <span className="font-display text-2xl text-ink/40">{r.n}</span>
                <div>
                  <h3 className="font-display text-3xl leading-tight">{r.title}</h3>
                  <p className="mt-3 text-base font-light leading-relaxed text-ink/75">{r.text}</p>
                </div>
              </Item>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
