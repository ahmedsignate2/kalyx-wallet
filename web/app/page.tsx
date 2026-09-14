import React from 'react';
import { Nav } from '../components/landing/nav';
import { Hero } from '../components/landing/hero';
import { Features } from '../components/landing/features';
import { Security } from '../components/landing/security';
import { Download } from '../components/landing/download';
import { Footer } from '../components/landing/footer';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Security />
        <Download />
      </main>
      <Footer />
    </div>
  );
}
