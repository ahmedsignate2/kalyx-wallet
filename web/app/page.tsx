import React from 'react';
import { Nav } from '../components/landing/nav';
import { ChapterRail } from '../components/landing/chapter';
import { Opening } from '../components/landing/opening';
import { Hero } from '../components/landing/hero';
import { HowItWorks } from '../components/landing/how-it-works';
import { NeverLose } from '../components/landing/never-lose';
import { NeverStolen } from '../components/landing/never-stolen';
import { Fees } from '../components/landing/fees';
import { Vision } from '../components/landing/vision';
import { Download } from '../components/landing/download';
import { Footer } from '../components/landing/footer';

/** Le site est un film en chapitres : ouverture, prologue, cinq chapitres, épilogue. */
export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <ChapterRail />
      <main>
        <Opening />
        <Hero />
        <HowItWorks />
        <NeverLose />
        <NeverStolen />
        <Fees />
        <Vision />
        <Download />
      </main>
      <Footer />
    </div>
  );
}
