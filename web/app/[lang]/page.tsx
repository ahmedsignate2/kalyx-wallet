import React from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../components/landing/nav';
import { Footer } from '../../components/landing/footer';
import { SunAi, SunDownload, SunFees, SunHero, SunHow, SunLose, SunNetworks, SunStolen, SunVision } from '../../components/sun/sections';
import { getDictionary, isLocale } from '../../i18n';

/** L'accueil du site, à l'image de l'app : le ciel et ses dunes, puis le crème et ses cartes. */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <div className="min-h-screen bg-ink">
      <Nav t={t} lang={lang} />
      <main>
        <SunHero t={t} />
        <SunNetworks t={t} />
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
