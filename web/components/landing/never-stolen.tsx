import React from 'react';
import { ChapterHead } from './chapter';
import { Item, Reveal, Stagger } from './motion';

/*
 * Vérifié dans le code :
 *  - src/domain/validation/poisoning.ts : même début + même fin, milieu différent → bloquant (app/send.tsx).
 *  - src/domain/tx/simulate.ts (Alchemy) + src/domain/wc/explain.ts + src/domain/security/goplus.ts :
 *    « Vous perdez / Vous recevez », risque, Verify ; Danger = Refuser par défaut + maintenir 2 s (ui/SignSheet.tsx).
 *  - src/security/pin.ts : LOCK_SCHEDULE_MS = 6 essais libres, puis 30 s, 1 min, 5 min, 15 min, 1 h.
 *  - src/security/vault.ts : AES-256-GCM, clé dérivée du PIN par scrypt ; stockage Keystore/Keychain.
 */
const SCHEDULE = [
  { tries: '1 à 6', wait: 'aucune attente' },
  { tries: '7', wait: '30 s' },
  { tries: '8', wait: '1 min' },
  { tries: '9', wait: '5 min' },
  { tries: '10', wait: '15 min' },
  { tries: '11+', wait: '1 h' },
];

function Address({ head, mid, tail, danger }: { head: string; mid: string; tail: string; danger?: boolean }) {
  return (
    <code className="block break-all font-mono text-sm text-bone sm:text-base">
      {head}
      <span className={danger ? 'rounded bg-[#ff6363]/20 px-0.5 text-[#ffb4b4]' : 'text-mist'}>{mid}</span>
      {tail}
    </code>
  );
}

export function NeverStolen() {
  return (
    <section id="voler" className="scroll-mt-16 bg-ink px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="III"
          kicker="Ne jamais se faire voler"
          title={
            <>
              Le vol n’arrive pas en forçant la porte. <em className="italic text-sage">Il arrive quand on l’ouvre.</em>
            </>
          }
          lead="Trois scènes que Kalyx joue tous les jours, telles qu’elles sont écrites dans le code."
        />

        <Stagger className="mt-20 grid gap-6 lg:grid-cols-3" gap={0.12}>
          {/* Scène 1 — le sosie */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">Scène 1 · L’empoisonnement d’adresse</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">Le sosie dans vos récents.</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">
              Un escroc vous envoie une poussière depuis une adresse qui commence et finit comme celle de votre ami. Un jour, vous la copiez.
            </p>
            <div className="mt-6 space-y-3 rounded-2xl border border-bone/10 bg-ink-3 p-4">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-mist/70">Votre ami</p>
                <Address head="0x7a3F" mid="c1D94e2B8f0a6C3e91b7D2a4F58c0E1d" tail="9c2E" />
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#ffb4b4]">Le sosie</p>
                <Address head="0x7a3F" mid="08bA71e3D5c26F9a4B0e8C7d1A6f3E2b" tail="9c2E" danger />
              </div>
            </div>
            <p className="mt-auto pt-6 font-display text-xl text-paper">
              Kalyx compare, et <em className="italic text-sage">bloque</em>. Pas un avertissement : un mur.
            </p>
          </Item>

          {/* Scène 2 — la signature traduite */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">Scène 2 · La signature</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">Ce que la dApp vous demande vraiment.</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">
              Un site vous tend un contrat en hexadécimal. Kalyx le simule, le traduit, et vérifie le domaine avec WalletConnect Verify et GoPlus.
            </p>
            <div className="mt-6 rounded-2xl border border-bone/10 bg-ink-3 p-4 text-sm">
              <p className="text-xs text-mist">app.uniswap.org demande une signature</p>
              <p className="mt-3 flex justify-between text-bone">
                <span>Vous perdez</span>
                <span className="font-mono">50 USDC</span>
              </p>
              <p className="mt-1 flex justify-between text-bone">
                <span>Vous recevez</span>
                <span className="font-mono">0,021 ETH</span>
              </p>
              <p className="mt-3 inline-block rounded-full bg-sage/15 px-2.5 py-1 text-xs text-sage">Risque faible · domaine vérifié</p>
            </div>
            <div className="mt-3 rounded-2xl border border-[#ff6363]/30 bg-[#ff6363]/5 p-4 text-sm">
              <p className="text-xs text-mist">Un site inconnu demande une signature</p>
              <p className="mt-3 text-bone">Autoriser ce contrat à déplacer tous vos NFT, sans limite.</p>
              <p className="mt-3 inline-block rounded-full bg-[#ff6363]/20 px-2.5 py-1 text-xs text-[#ffb4b4]">
                Danger · « Refuser » par défaut, maintenir 2 s pour accepter
              </p>
            </div>
          </Item>

          {/* Scène 3 — le téléphone volé */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">Scène 3 · Le téléphone volé</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">Le voleur a votre téléphone. Pas votre PIN.</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">
              Votre phrase est chiffrée en AES-256-GCM avec une clé dérivée de votre PIN par scrypt, puis rangée dans le Keystore ou le Keychain. Sans le PIN, il ne reste que du bruit. Et chaque erreur coûte du temps :
            </p>
            <ol className="mt-6 divide-y divide-bone/10 rounded-2xl border border-bone/10 bg-ink-3 text-sm">
              {SCHEDULE.map((s) => (
                <li key={s.tries} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-mist">
                    Essai{s.tries.includes('à') || s.tries.includes('+') ? 's' : ''} {s.tries}
                  </span>
                  <span className="font-display text-bone">{s.wait}</span>
                </li>
              ))}
            </ol>
            <p className="mt-auto pt-6 text-sm font-light text-mist">
              Et si un jour vous perdez le téléphone : vos douze mots, sur leur papier, recréent tout sur un autre.
            </p>
          </Item>
        </Stagger>

        <Reveal className="mt-14 border-t border-bone/10 pt-8">
          <p className="max-w-3xl font-display text-2xl leading-snug text-paper sm:text-3xl">
            Tout cela tourne <em className="italic text-sage">sur votre téléphone</em>. Kalyx n’a pas de serveur qui voit vos clés, votre adresse IP ne nous
            est jamais envoyée, aucun SDK d’analyse ne regarde par-dessus votre épaule.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
