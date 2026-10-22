/**
 * CE QU'ON SAIT D'UN SITE avant de s'y connecter (fenêtre de connexion).
 *
 *  - son icône, telle que Chrome l'a lue dans l'onglet (jamais une URL fournie
 *    par la page à travers le pont) ;
 *  - le verdict anti-hameçonnage GoPlus, à trois états (signalé, rien de
 *    connu, analyse impossible) ;
 *  - un SOSIE de domaine connu (« uniswap-claim.com », « jup-ag.app »,
 *    « opensae.io »…) : repéré ici, sans réseau — les faux sites ont souvent
 *    quelques heures, aucune liste ne les connaît encore ;
 *  - déjà connecté ou première visite.
 */
import { phishingSiteStatus, type PhishingVerdict } from '../../src/domain/security/goplus';

/** Domaines de dApps très imités (domaine enregistrable : les sous-domaines sont légitimes). */
const BRANDS = [
  // Noms DISTINCTIFS seulement : un mot courant (relay, curve, base, blast…) donnerait de fausses alertes (« delay.com »).
  'uniswap.org', 'opensea.io', 'pancakeswap.finance', 'metamask.io', 'etherscan.io', 'solscan.io', 'basescan.org', 'arbiscan.io',
  'hyperliquid.xyz', 'eigenlayer.xyz', 'etherfi.io', 'raydium.io', 'magiceden.io', 'phantom.app', 'marinade.finance', 'debank.com',
  'zksync.io', 'dydx.exchange', 'coinbase.com', 'binance.com', 'kraken.com', 'ledger.com', 'trezor.io', 'rabby.io', 'jup.ag',
  'kalyxwallet.com',
]

/** Domaine enregistrable (approximation : les deux derniers libellés, trois pour co.uk & co). */
export function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  const two = parts.slice(-2).join('.');
  return /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(two) && parts.length > 2 ? parts.slice(-3).join('.') : two;
}

/** Distance d'édition (Damerau, transpositions comprises), bornée. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Le domaine connu qu'imite `host`, ou null. Imitation = domaine enregistrable
 * DIFFÉRENT mais à une ou deux lettres près, ou nom de marque collé à autre
 * chose (« uniswap-airdrop.com », « claim-lido.org », « jupag.app »).
 */
export function lookalikeOf(host: string): string | null {
  const reg = registrable(host);
  if (BRANDS.includes(reg)) return null;
  const label = reg.split('.')[0];
  for (const brand of BRANDS) {
    const bLabel = brand.split('.')[0];
    const flat = brand.replace(/\./g, '');
    // Même nom, autre extension (uniswap.app, jup.ag → jupag.io).
    if (label === bLabel && bLabel.length >= 4) return brand;
    if (label === flat && flat.length >= 5) return brand;
    // Marque accolée à un mot (claim, airdrop, app…), séparée par un tiret.
    if (bLabel.length >= 5 && label.split('-').length > 1 && label.split('-').includes(bLabel)) return brand;
    // À une ou deux lettres près (deux seulement pour les noms longs).
    const max = bLabel.length >= 8 ? 2 : bLabel.length >= 5 ? 1 : 0;
    if (max && label !== bLabel && distance(label, bLabel, max) <= max) return brand;
  }
  return null;
}

/** Icône acceptée : https, ou image en data: (bornée). Rien d'autre (ni javascript:, ni chrome:). */
export function safeIcon(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.length > 200_000) return undefined;
  if (/^data:image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp|svg\+xml)[;,]/i.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export interface SiteReport {
  verdict: PhishingVerdict;
  lookalike: string | null;
  /** Site déjà connecté (EVM ou Solana) par le passé. */
  known: boolean;
}

export async function siteReport(origin: string, known: boolean, deps: { phishing?: (url: string) => Promise<PhishingVerdict>; timeoutMs?: number } = {}): Promise<SiteReport> {
  const host = new URL(origin).hostname;
  const verdict = await Promise.race([
    (deps.phishing ?? phishingSiteStatus)(origin).catch((): PhishingVerdict => 'unknown'),
    new Promise<PhishingVerdict>((r) => setTimeout(() => r('unknown'), deps.timeoutMs ?? 4000)),
  ]);
  return { verdict, lookalike: lookalikeOf(host), known };
}
