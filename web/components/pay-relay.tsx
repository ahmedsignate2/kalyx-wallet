'use client';

import { useEffect, useState } from 'react';
import { APK_URL } from '../lib/apk';

/**
 * Ce que la page sait dire d'une demande de paiement.
 *
 * Analyse VOLONTAIREMENT minimale et destinée à l'AFFICHAGE seul : rien n'est
 * signé ni envoyé ici, et l'app refait le travail pour de bon avec sa propre
 * validation d'adresse. Une page web ne décide pas d'un paiement — elle montre
 * ce qui est demandé, pour que personne n'ouvre son portefeuille à l'aveugle.
 */
interface PayRequest {
  chain: string;
  address: string;
  amount?: string;
  label?: string;
}

const CHAINS: Record<string, string> = {
  'bitcoin:': 'Bitcoin',
  'ethereum:': 'Ethereum',
  'solana:': 'Solana',
};

function describe(uri: string): PayRequest | null {
  const scheme = Object.keys(CHAINS).find((s) => uri.toLowerCase().startsWith(s));
  if (!scheme) return null;

  const body = uri.slice(scheme.length);
  const qi = body.indexOf('?');
  const path = qi < 0 ? body : body.slice(0, qi);
  const query = new URLSearchParams(qi < 0 ? '' : body.slice(qi + 1));

  // EIP-681 : `[pay-]<adresse>[@chainId][/fonction]`. Le destinataire d'un
  // `transfer` est dans `?address=`, pas en tête du lien.
  const target = path.replace(/^pay-/i, '').split('/')[0].split('@')[0];
  const address = query.get('address') || target;
  if (!address) return null;

  return {
    chain: CHAINS[scheme],
    address,
    amount: query.get('amount') || undefined,
    label: query.get('label') || undefined,
  };
}

/** Adresse abrégée : lisible d'un coup d'œil, vérifiable aux deux bouts. */
const short = (a: string) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);

/**
 * Relais de demande de paiement : https://kalyxwallet.com/pay?uri=bitcoin:…
 *
 * Si Kalyx est installée, l'OS ouvre l'app avant même que cette page s'affiche
 * (App Link vérifié / Universal Link). Sinon on montre la demande, on tente le
 * deep link `kalyx://pay?uri=…`, puis on propose l'installation.
 */
export function PayRelay() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [req, setReq] = useState<PayRequest | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const uri = new URLSearchParams(window.location.search).get('uri');
    const target = uri ? `kalyx://pay?uri=${encodeURIComponent(uri)}` : 'kalyx://';
    setDeepLink(target);
    setReq(uri ? describe(uri) : null);
    window.location.href = target;
    const t = setTimeout(() => setFallback(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-4">
      {req && (
        <div className="w-full rounded-2xl border border-white/10 px-5 py-4 text-left">
          <p className="text-xs uppercase tracking-wide text-mist">Demande de paiement</p>
          {req.label && <p className="mt-2 text-base text-paper">{req.label}</p>}
          {req.amount && (
            <p className="mt-1 font-display text-2xl text-paper">
              {req.amount} <span className="text-base text-mist">{req.chain}</span>
            </p>
          )}
          <p className="mt-2 break-all font-mono text-xs text-mist">{short(req.address)}</p>
        </div>
      )}
      <p className="text-mist">
        {fallback ? 'Kalyx ne semble pas installée sur cet appareil.' : 'Ouverture de Kalyx…'}
      </p>
      {deepLink && (
        <a
          href={deepLink}
          className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-medium text-ink"
        >
          Ouvrir dans Kalyx
        </a>
      )}
      {fallback && (
        <a
          href={APK_URL}
          download
          className="text-sm text-mist underline underline-offset-4 hover:text-paper"
        >
          Télécharger Kalyx pour Android
        </a>
      )}
    </div>
  );
}
