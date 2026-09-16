import React from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../components/landing/nav';
import { ChapterRail } from '../../components/landing/chapter';
import { Opening } from '../../components/landing/opening';
import { Hero } from '../../components/landing/hero';
import { HowItWorks } from '../../components/landing/how-it-works';
import { NeverLose } from '../../components/landing/never-lose';
import { NeverStolen } from '../../components/landing/never-stolen';
import { Ai } from '../../components/landing/ai';
import { Fees } from '../../components/landing/fees';
import { Vision } from '../../components/landing/vision';
import { Download } from '../../components/landing/download';
import { Footer } from '../../components/landing/footer';
import { getDictionary, isLocale } from '../../i18n';

/** Le site est un film en chapitres : ouverture, prologue, six chapitres, épilogue — dans la langue de la route. */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <div className="min-h-screen">
      <Nav t={t} lang={lang} />
      <ChapterRail t={t} />
      <main>
        <Opening t={t} />
        <Hero t={t} />
        <HowItWorks t={t} />
        <NeverLose t={t} />
        <NeverStolen t={t} />
        <Ai t={t} />
        <Fees t={t} />
        <Vision t={t} />
        <Download t={t} />
      </main>
      <Footer t={t} lang={lang} />
    </div>
  );
}
