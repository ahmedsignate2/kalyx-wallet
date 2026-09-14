import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { BentoGrid } from '../components/BentoGrid';
import { SecuritySection } from '../components/SecuritySection';
import { DownloadSection } from '../components/DownloadSection';
import { Footer } from '../components/Footer';
import { ScrollHalo } from '../components/ScrollHalo';

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <ScrollHalo />
      <Navbar />
      <main className="relative z-10">
        <Hero />
        <BentoGrid />
        <SecuritySection />
        <DownloadSection />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
