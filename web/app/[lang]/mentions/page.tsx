import React from 'react';
import { notFound } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { LegalPage } from '../../../components/legal-page';
import { sections } from '../../../content/mentions';
import { getDictionary, isLocale } from '../../../i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return { title: `${t.legal.mentionsTitle} — Kalyx Wallet`, description: t.legal.mentionsIntro };
}

export default async function MentionsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <LegalPage
      t={t}
      lang={lang}
      icon={Landmark}
      title={t.legal.mentionsTitle}
      intro={t.legal.mentionsIntro}
      meta={t.legal.mentionsMeta}
      sections={sections}
      contactTitle={t.legal.mentionsContact}
      contactText={t.legal.contactText}
    />
  );
}
