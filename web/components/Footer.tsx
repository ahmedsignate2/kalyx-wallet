import React from 'react';
import Link from 'next/link';
import { Mail, Send, Twitter } from 'lucide-react';
import { Mark } from './Mark';

const columns = [
  {
    title: 'Produit',
    links: [
      { href: '/#features', label: 'Fonctionnalités' },
      { href: '/#security', label: 'Sécurité' },
      { href: '/#download', label: 'Télécharger l’APK' },
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
    title: 'Assistance',
    links: [
      {
        href: 'mailto:support@kalyxwallet.com',
        label: 'support@kalyxwallet.com',
      },
      { href: 'https://t.me/kalyxntw', label: 'Telegram', external: true },
      { href: 'https://x.com/kalyxntw', label: 'X (Twitter)', external: true },
    ],
  },
];

const socials = [
  { href: 'https://t.me/kalyxntw', label: 'Telegram', icon: Send },
  { href: 'https://x.com/kalyxntw', label: 'X', icon: Twitter },
  { href: 'mailto:support@kalyxwallet.com', label: 'E-mail', icon: Mail },
];

export function Footer() {
  return (
    <footer className="border-t border-trait px-5 pb-10 pt-16 sm:px-8">
      <div className="mx-auto max-w-page">
        <div className="grid grid-cols-1 gap-10 border-b border-trait pb-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 text-lueur">
              <Mark size={22} />
              <span className="text-lg font-semibold tracking-[-0.02em]">Kalyx</span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-brume">
              Portefeuille non-custodial multi-chaînes. Tes clés sur ton téléphone, chaque signature expliquée avant
              d’être donnée.
            </p>
            <div className="flex items-center gap-2">
              {socials.map(({ href, label, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  aria-label={label}
                  className="flex h-12 w-12 items-center justify-center rounded-input bg-nuit text-brume ring-1 ring-trait transition-colors duration-150 hover:bg-orbite hover:text-lueur"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-sm font-semibold text-lueur">{col.title}</h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brume transition-colors hover:text-lueur"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-brume transition-colors hover:text-lueur">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-8 text-xs leading-relaxed text-cendre">
          <p>
            <span className="font-medium text-brume">Éditeur :</span> Kalyx, entreprise individuelle de Ahamed Signate ·
            SIRET en cours d’attribution · support@kalyxwallet.com
          </p>
          <p>
            <span className="font-medium text-brume">Hébergement :</span> application non-custodial exécutée en local
            sur l’appareil de l’utilisateur, sans serveur de détention de clés.
          </p>
          <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Kalyx. Tous droits réservés.</p>
            <p>Conçu pour l’auto-souveraineté financière.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
