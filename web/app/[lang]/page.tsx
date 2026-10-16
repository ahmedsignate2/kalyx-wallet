import React from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../components/landing/nav';
import { Footer } from '../../components/landing/footer';
import { Finale, Giant, Highlights, LitText, Reveal, SecurityScroll } from '../../components/keynote/scenes';
import { Copilot, Fees, Keep, Networks, Specs, Verify } from '../../components/keynote/sections';
import { Credits, FilmOpening, Theater, TitleCard } from '../../components/film/film';
import { getDictionary, isLocale } from '../../i18n';

/**
 * L'accueil est un film : générique d'ouverture, prologue, six chapitres
 * annoncés par des cartons, épilogue à l'aube, générique de fin.
 */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const c = t.chapters;
  const first = t.how.steps[0];
  const s = t.stolen;
  const chapters = [
    { id: 'ouverture', label: t.opening.title },
    { id: 'prologue', label: c.prologue },
    { id: 'fonctionnement', label: c.how },
    { id: 'perdre', label: c.lose },
    { id: 'voler', label: c.stolen },
    { id: 'copilote', label: c.ai },
    { id: 'frais', label: c.fees },
    { id: 'vision', label: c.vision },
    { id: 'telecharger', label: c.epilogue },
  ];
  return (
    <div className="min-h-screen bg-black">
      <Theater chapters={chapters} />
      <Nav t={t} lang={lang} />
      <main>
        <FilmOpening t={t} />
        <TitleCard word={c.prologue} name={t.hero.kicker.split('·').pop()?.trim() ?? c.prologue} />
        <Reveal t={t} name={false} />
        <Networks t={t} />

        <TitleCard numeral="I" word={c.chapter} name={c.how} />
        <Highlights t={t} />
        <Giant value={first.value} label={first.label} text={first.text} />

        <TitleCard numeral="II" word={c.chapter} name={c.lose} />
        <Keep t={t} />

        <TitleCard numeral="III" word={c.chapter} name={c.stolen} />
        <SecurityScroll t={t} />
        <section className="bg-black px-5 py-24 sm:px-8 sm:py-36">
          <div className="mx-auto max-w-5xl">
            <LitText parts={[[s.footer1], [s.footerEm, true], [s.footer2]]} />
          </div>
        </section>

        <TitleCard numeral="IV" word={c.chapter} name={c.ai} />
        <Copilot t={t} />

        <TitleCard numeral="V" word={c.chapter} name={c.fees} />
        <Fees t={t} />

        <TitleCard numeral="VI" word={c.chapter} name={c.vision} />
        <section id="vision" className="scroll-mt-12 bg-black px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-5xl">
            <LitText parts={[[`${t.vision.title} ${t.vision.titleEm}`, true], [t.vision.lines.join(' ')]]} />
          </div>
        </section>
        <Specs t={t} />

        <TitleCard word={c.epilogue} name={t.download.title} />
        <Finale t={t}>
          <Verify t={t} />
        </Finale>
        <Credits t={t} />
      </main>
      <Footer t={t} lang={lang} />
    </div>
  );
}
