import React from 'react';
import { notFound } from 'next/navigation';
import { Shield } from 'lucide-react';
import { LegalPage } from '../../../components/legal-page';
import { sections } from '../../../content/privacy';
import { getDictionary, isLocale } from '../../../i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return { title: `${t.legal.privacyTitle} — Kalyx Wallet`, description: t.legal.privacyIntro };
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <LegalPage
      t={t}
      lang={lang}
      icon={Shield}
      title={t.legal.privacyTitle}
      intro={t.legal.privacyIntro}
      meta={t.legal.privacyMeta}
      sections={sections}
      contactTitle={t.legal.privacyContact}
      contactText={t.legal.contactText}
    />
  );
}
