import React from 'react';
import { ChapterHead } from './chapter';
import { Reveal } from './motion';
import { HoldToSendScene, PoisonScene, SignScene, UnlockScene } from './scenes';

/*
 * Vérifié dans le code :
 *  - lib/biometrics.ts, src/security/pin.ts : LOCK_SCHEDULE_MS = 6 essais libres, puis 30 s, 1 min, 5 min, 15 min, 1 h.
 *  - src/security/vault.ts : AES-256-GCM, clé dérivée du PIN par scrypt ; stockage Keystore/Keychain.
 *  - ui/PrivacyScreen.tsx : floutage dans les applications récentes.
 *  - app/send.tsx : maintenir 1,2 s (durations.holdToSend), éclat 700 ms (durations.burst).
 *  - src/domain/tx/simulate.ts (Alchemy) + src/domain/wc/explain.ts + src/domain/security/goplus.ts :
 *    « Vous perdez / Vous recevez », risque, WalletConnect Verify ; Danger = Refuser par défaut + maintenir 2 s.
 *  - src/domain/validation/poisoning.ts : même début + même fin, milieu différent → bloquant.
 */
const SCHEDULE = [
  ['1 à 6', 'aucune attente'],
  ['7', '30 s'],
  ['8', '1 min'],
  ['9', '5 min'],
  ['10', '15 min'],
  ['11 et plus', '1 h'],
];

const scenes = [
  {
    n: 'Scène 1',
    title: 'Votre visage ouvre. Un mauvais code fait attendre.',
    body: (
      <>
        <p>
          Empreinte ou visage pour entrer, un PIN en secours. Votre phrase est chiffrée en AES-256-GCM avec une clé dérivée de ce PIN par
          scrypt, puis rangée dans le Keystore ou le Keychain : sans le code, un voleur n’a que du bruit.
        </p>
        <p className="mt-4">Et chaque erreur coûte du temps :</p>
        <ol className="mt-3 divide-y divide-bone/10 rounded-2xl border border-bone/10 text-sm">
          {SCHEDULE.map(([tries, wait]) => (
            <li key={tries} className="flex items-center justify-between px-4 py-2">
              <span className="text-mist">Essai{tries.includes(' ') ? 's' : ''} {tries}</span>
              <span className="font-display text-bone">{wait}</span>
            </li>
          ))}
        </ol>
      </>
    ),
    Scene: UnlockScene,
  },
  {
    n: 'Scène 2',
    title: 'Un envoi ne part pas d’un tap. Il part d’un geste.',
    body: (
      <>
        <p>
          Le récapitulatif dit tout en euros : le montant, les frais, et « votre solde passera de A à B ». Puis vous maintenez le doigt
          1,2 seconde. Pas de bouton qu’on effleure par erreur, pas de « êtes-vous sûr ? » à cliquer sans lire.
        </p>
        <p className="mt-4">Quand ça part, l’écran s’éclaire : 40 particules, 700 millisecondes. Vous savez que c’est fait.</p>
      </>
    ),
    Scene: HoldToSendScene,
  },
  {
    n: 'Scène 3',
    title: 'Ce que la dApp vous demande, en français.',
    body: (
      <>
        <p>
          Un site vous tend un contrat en hexadécimal. Kalyx le simule et l’écrit en clair : « vous perdez 50 USDC, vous recevez 0,021 ETH »,
          avec le niveau de risque, le domaine confirmé par WalletConnect Verify, le contrat vérifié par GoPlus.
        </p>
        <p className="mt-4">
          Quand c’est un piège — « déplacer tous vos NFT, sans limite » — la feuille passe au rouge, <span className="text-bone">Refuser</span>{' '}
          devient le bouton principal, et accepter demande de maintenir deux secondes.
        </p>
      </>
    ),
    Scene: SignScene,
  },
  {
    n: 'Scène 4',
    title: 'Le sosie dans vos récents.',
    body: (
      <>
        <p>
          Un escroc vous envoie une poussière depuis une adresse qui commence et finit exactement comme celle de votre ami. Un jour, pressé,
          vous la copiez depuis l’historique.
        </p>
        <p className="mt-4">
          Avant chaque envoi, Kalyx compare le destinataire à vos adresses connues. Même début, même fin, milieu différent : ce n’est pas un
          avertissement, c’est <span className="text-bone">un mur</span>.
        </p>
      </>
    ),
    Scene: PoisonScene,
  },
];

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
          lead="Quatre scènes que l’application rejoue tous les jours. Ce ne sont pas des vidéos : ce sont ses écrans, avec ses tempos."
        />

        <div className="mt-20 space-y-24 lg:space-y-32">
          {scenes.map(({ n, title, body, Scene }, i) => (
            <Reveal key={n} className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-20 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <div className="flex justify-center">
                <Scene />
              </div>
              <div>
                <p className="font-display text-sm text-sage">{n}</p>
                <h3 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">{title}</h3>
                <div className="mt-5 max-w-md text-base font-light leading-relaxed text-mist">{body}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-24 border-t border-bone/10 pt-8">
          <p className="max-w-3xl font-display text-2xl leading-snug text-paper sm:text-3xl">
            Tout cela tourne <em className="italic text-sage">sur votre téléphone</em>. Kalyx n’a pas de serveur qui voit vos clés, votre adresse IP ne
            nous est jamais envoyée, aucun SDK d’analyse ne regarde par-dessus votre épaule. Et l’app se floute dans les applications récentes.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
