import React from 'react';
import Link from 'next/link';
import { Mark } from './mark';

const columns = [
  {
    title: 'Produit',
    links: [
      { href: '/#fonctionnement', label: 'Comment ça marche' },
      { href: '/#voler', label: 'Sécurité' },
      { href: '/#frais', label: 'Frais' },
      { href: '/#telecharger', label: 'Télécharger l’APK' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/privacy', label: 'Politique de confidentialité' },
      { href: '/terms', label: 'Conditions d’utilisation' },
      { href: '/privacy#hosting', label: 'Mentions légales' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { href: 'mailto:support@kalyxwallet.com', label: 'support@kalyxwallet.com' },
      { href: 'https://t.me/kalyxntw', label: 'Telegram', external: true },
      { href: 'https://x.com/kalyxntw', label: 'X (Twitter)', external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-bone/10 bg-ink-2 px-5 pb-10 pt-16 sm:px-8">
      <div className="mx-auto max-w-page">
        <div className="grid grid-cols-1 gap-10 border-b border-bone/10 pb-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 text-paper">
              <Mark size={22} className="text-sage" />
              <span className="font-display text-xl tracking-tight">Kalyx</span>
            </Link>
            <p className="max-w-sm text-sm font-light leading-relaxed text-mist">
              Portefeuille non-custodial multi-chaînes. Vos clés sur votre téléphone, chaque signature expliquée avant d’être donnée.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs uppercase tracking-[0.18em] text-bone/70">{col.title}</h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-mist transition-colors hover:text-paper">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-mist transition-colors hover:text-paper">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-8 text-xs font-light leading-relaxed text-mist/80">
          <p>
            <span className="text-bone/80">Éditeur :</span> Kalyx, entreprise individuelle de Ahamed Signate · SIRET en cours d’attribution · support@kalyxwallet.com
          </p>
          <p>
            <span className="text-bone/80">Hébergement :</span> application non-custodial exécutée en local sur l’appareil de l’utilisateur, sans serveur de détention de clés.
          </p>
          <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Kalyx. Tous droits réservés.</p>
            <p className="font-display italic text-bone/70">Conçu pour l’auto-souveraineté financière.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
