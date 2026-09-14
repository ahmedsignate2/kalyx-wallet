import React from 'react';
import { ChapterHead } from './chapter';
import { Item, Reveal, Stagger } from './motion';

/*
 * Vérifié dans le code :
 *  - src/domain/swap/lifi.ts : KALYX_FEE = 0,3 % (intégrateur déclaré), EARN_FEE = 0 %.
 *  - src/domain/swap/jupiter.ts : aucun platformFee → 0 % sur Solana.
 *  - Envoyer / recevoir : aucun frais Kalyx, seulement les frais réseau, affichés en devise
 *    avant la signature (app/send.tsx, gas manquant indiqué en devise).
 */
const fees = [
  { value: '0 €', label: 'pour envoyer, recevoir, détenir', note: 'Seuls les frais du réseau s’appliquent — ils vont aux validateurs, pas à nous.' },
  { value: '0,3 %', label: 'sur un échange via LI.FI', note: 'EVM et d’une chaîne à l’autre. C’est la seule rémunération de Kalyx.' },
  { value: '0 %', label: 'sur un échange Solana via Jupiter', note: 'Aucune commission ajoutée à la route.' },
  { value: '0 %', label: 'sur Earn', note: 'Aave, Lido, Rocket Pool, Benqi, Jito, Marinade : rien prélevé au dépôt ni au retrait.' },
  { value: '0 €', label: 'd’abonnement, pour toujours', note: 'Pas de version « pro », pas de fonctionnalité derrière un péage.' },
];

export function Fees() {
  return (
    <section id="frais" className="scroll-mt-16 bg-ink-2 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="IV"
          kicker="Les frais, sans détour"
          title={
            <>
              Comment Kalyx gagne sa vie. <em className="italic text-sage">En une ligne.</em>
            </>
          }
          lead="Les wallets gratuits ont souvent un prix caché dans la route d’un échange. Voici le nôtre, chiffre par chiffre, tel qu’il est écrit dans le code."
        />

        <Stagger as="ul" className="mt-16 divide-y divide-bone/10 border-y border-bone/10" gap={0.1}>
          {fees.map((f) => (
            <Item key={f.label} as="li" className="grid gap-2 py-7 sm:grid-cols-[10rem_1fr] sm:gap-8 lg:grid-cols-[14rem_1fr_1fr]">
              <span className="font-display text-5xl font-light leading-none text-paper sm:text-6xl">{f.value}</span>
              <span className="self-center text-lg text-bone">{f.label}</span>
              <span className="self-center text-sm font-light leading-relaxed text-mist lg:col-start-3">{f.note}</span>
            </Item>
          ))}
        </Stagger>

        <Reveal className="mt-12 grid gap-6 lg:grid-cols-2">
          <p className="text-base font-light leading-relaxed text-mist">
            Avant chaque signature, les frais réseau sont affichés <span className="text-bone">en euros</span>, avec les paliers possibles. S’il vous manque du gas, Kalyx vous
            dit combien — en euros aussi, pas en gwei.
          </p>
          <p className="text-base font-light leading-relaxed text-mist">
            Aucun achat par carte, aucune vente en fiat dans l’app : ce sont des services régulés, avec vérification d’identité. Le jour où nous en proposerons, ce sera
            avec un partenaire agréé, dans un module séparé, jamais mêlé à vos clés.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
