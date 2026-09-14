import React from 'react';
import { notFound } from 'next/navigation';
import { Scale } from 'lucide-react';
import { LegalPage } from '../../../components/legal-page';
import { sections } from '../../../content/terms';
import { getDictionary, isLocale } from '../../../i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return { title: `${t.legal.termsTitle} — Kalyx Wallet`, description: t.legal.termsIntro };
}

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <LegalPage
      t={t}
      lang={lang}
      icon={Scale}
      title={t.legal.termsTitle}
      intro={t.legal.termsIntro}
      meta={t.legal.termsMeta}
      sections={sections}
      contactTitle={t.legal.termsContact}
      contactText={t.legal.contactText}
    />
  );
}
