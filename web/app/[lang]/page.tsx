import React from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../components/landing/nav';
import { Footer } from '../../components/landing/footer';
import { Intro, Opening, Progress } from '../../components/sun/alive';
import { SunAi, SunDownload, SunFees, SunHero, SunHow, SunLose, SunNetworks, SunStolen, SunVision } from '../../components/sun/sections';
import { getDictionary, isLocale } from '../../i18n';

/** L'accueil du site, à l'image de l'app : le ciel et ses dunes, puis le crème et ses chapitres, et les gestes de l'app rejoués. */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const sections = [
    { id: 'prologue', label: t.chapters.prologue },
    { id: 'fonctionnement', label: t.chapters.how },
    { id: 'perdre', label: t.chapters.lose },
    { id: 'voler', label: t.chapters.stolen },
    { id: 'copilote', label: t.chapters.ai },
    { id: 'frais', label: t.chapters.fees },
    { id: 'vision', label: t.chapters.vision },
    { id: 'telecharger', label: t.chapters.epilogue },
  ];
  return (
    <div className="min-h-screen bg-ink">
      <Intro />
      <Progress sections={sections} />
      <Nav t={t} lang={lang} />
      <main>
        <SunHero t={t} />
        <SunNetworks t={t} />
        <Opening t={t} />
        <SunHow t={t} />
        <SunLose t={t} />
        <SunStolen t={t} />
        <SunAi t={t} />
        <SunFees t={t} />
        <SunVision t={t} />
        <SunDownload t={t} />
      </main>
      <Footer t={t} lang={lang} />
    </div>
  );
}
