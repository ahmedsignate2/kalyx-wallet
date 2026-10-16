import React from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../components/landing/nav';
import { Footer } from '../../components/landing/footer';
import { Opening } from '../../components/sun/alive';
import { Finale, Giant, Highlights, LitText, Reveal, SecurityScroll } from '../../components/keynote/scenes';
import { Copilot, Fees, Keep, Networks, Specs, Verify } from '../../components/keynote/sections';
import { getDictionary, isLocale } from '../../i18n';

/** L'accueil, mis en scène comme une keynote : le produit se dévoile au fil du défilement. */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const first = t.how.steps[0];
  const s = t.stolen;
  return (
    <div className="min-h-screen bg-black">
      <Nav t={t} lang={lang} />
      <main>
        <Reveal t={t} />
        <Networks t={t} />
        <Highlights t={t} />
        <Giant value={first.value} label={first.label} text={first.text} />
        <section id="vision" className="scroll-mt-12 bg-black px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-5xl">
            <p className="text-sm font-semibold text-[#E6C682]">{t.vision.kicker}</p>
            <LitText className="mt-6" parts={[[`${t.vision.title} ${t.vision.titleEm}`, true], [t.vision.lines.join(' ')]]} />
          </div>
        </section>
        <Specs t={t} />
        <div className="bg-ink">
          <Opening t={t} />
        </div>
        <Keep t={t} />
        <SecurityScroll t={t} />
        <section className="bg-black px-5 py-24 sm:px-8 sm:py-36">
          <div className="mx-auto max-w-5xl">
            <LitText parts={[[s.footer1], [s.footerEm, true], [s.footer2]]} />
          </div>
        </section>
        <Copilot t={t} />
        <Fees t={t} />
        <Finale t={t}>
          <Verify t={t} />
        </Finale>
      </main>
      <Footer t={t} lang={lang} />
    </div>
  );
}
