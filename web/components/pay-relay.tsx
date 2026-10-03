'use client';

import { useEffect, useState } from 'react';
import { APK_URL } from '../lib/apk';
import { useRelayText } from './relay-i18n';

/**
 * Ce que la page sait dire d'une demande de paiement.
 *
 * Analyse VOLONTAIREMENT minimale et destinée à l'AFFICHAGE seul : rien n'est
 * signé ni envoyé ici, et l'app refait le travail pour de bon avec sa propre
 * validation d'adresse. Une page web ne décide pas d'un paiement — elle montre
 * ce qui est demandé, pour que personne n'ouvre son portefeuille à l'aveugle.
 */
interface PayRequest {
  /** Réseau lisible, ou numéro EVM à traduire. */
  chain: string;
  evmChainId?: string;
  address: string;
  /** Montant à afficher, dans l'unité `unit` — absent si le lien ne le dit pas SANS ambiguïté. */
  amount?: string;
  /** Symbole de la pièce native, ou `token` (jeton dont le lien ne donne pas le symbole). */
  unit?: string | 'token';
  label?: string;
}

const CHAINS: Record<string, { name: string; symbol: string }> = {
  'bitcoin:': { name: 'Bitcoin', symbol: 'BTC' },
  'ethereum:': { name: 'Ethereum', symbol: 'ETH' },
  'solana:': { name: 'Solana', symbol: 'SOL' },
};

/** Wei (entier, éventuellement en notation 1e18) → ETH lisible ; null si illisible. */
function weiToEth(v: string): string | null {
  const m = v.trim().match(/^(\d+)(?:e(\d+))?$/i);
  if (!m) return null;
  if (m[1].length > 80 || Number(m[2] ?? 0) > 60) return null; // borne : un exposant énorme figerait la page
  const wei = BigInt(m[1]) * 10n ** BigInt(m[2] ?? '0');
  const int = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
}

function describe(uri: string): PayRequest | null {
  const scheme = Object.keys(CHAINS).find((s) => uri.toLowerCase().startsWith(s));
  if (!scheme) return null;
  const chain = CHAINS[scheme];

  const body = uri.slice(scheme.length);
  const qi = body.indexOf('?');
  const path = qi < 0 ? body : body.slice(0, qi);
  const query = new URLSearchParams(qi < 0 ? '' : body.slice(qi + 1));
  const label = query.get('label') || undefined;

  if (scheme === 'ethereum:') {
    // EIP-681 : `[pay-]<adresse>[@chainId][/fonction]`. Le destinataire d'un
    // `transfer` est dans `?address=`, pas en tête du lien.
    const [head, fn] = path.replace(/^pay-/i, '').split('/');
    const [target, chainId] = head.split('@');
    const address = (fn ? query.get('address') : null) || target;
    if (!address) return null;
    const evmChainId = chainId && chainId !== '1' ? chainId : undefined;
    // `value` est en WEI, natif seulement ; un `transfer` porte des unités du jeton, sans décimales connues ici : pas de montant affiché.
    const value = !fn ? query.get('value') : null;
    const eth = value ? weiToEth(value) : null;
    return { chain: chain.name, evmChainId, address, amount: eth ?? undefined, unit: evmChainId ? undefined : chain.symbol, label };
  }

  const address = path.split('/')[0];
  if (!address) return null;
  const amount = query.get('amount') || undefined;
  // Solana Pay : avec `spl-token`, le montant est en JETONS (USDC…), pas en SOL.
  const unit = scheme === 'solana:' && query.get('spl-token') ? 'token' : chain.symbol;
  return { chain: chain.name, address, amount, unit, label };
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
  const tx = useRelayText();

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
          <p className="text-xs uppercase tracking-wide text-mist">
            {tx.paymentRequest} · {req.evmChainId ? tx.evmChain(req.evmChainId) : req.chain}
          </p>
          {req.label && <p className="mt-2 text-base text-paper">{req.label}</p>}
          {req.amount && req.unit && (
            <p className="mt-1 font-display text-2xl text-paper">
              {req.amount} <span className="text-base text-mist">{req.unit === 'token' ? tx.token : req.unit}</span>
            </p>
          )}
          <p className="mt-2 break-all font-mono text-xs text-mist">{short(req.address)}</p>
        </div>
      )}
      <p className="text-mist">
        {fallback ? tx.notInstalled : tx.opening}
      </p>
      {deepLink && (
        <a
          href={deepLink}
          className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-medium text-ink"
        >
          {tx.openInKalyx}
        </a>
      )}
      {fallback && (
        <a
          href={APK_URL}
          download
          className="text-sm text-mist underline underline-offset-4 hover:text-paper"
        >
          {tx.downloadAndroid}
        </a>
      )}
    </div>
  );
}
