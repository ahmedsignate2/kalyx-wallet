/**
 * Formatage LISIBLE des montants — une seule règle pour toute l'app.
 *
 * Principe : la précision suit la GRANDEUR (chiffres significatifs), pas le
 * nombre de décimales du token. 1 234,5678 ETH et 0,00003771 ETH sont tous deux
 * lisibles ; « 0.001831000000000000 » ne l'est pas.
 *
 *   ≥ 1 000 000  → 1.23 M (compact) ou 1 234 567.89
 *   ≥ 1          → max 4 décimales   (1234.5678 → 1 234.5678 ; 2.5 → 2.5)
 *   < 1          → 4 chiffres significatifs, max 8 décimales
 *                  (0.001831 ; 0.00003771 ; 0.12345678 → 0.1234, tronqué)
 *   poussière    → <0.00000001
 *
 * Tout se calcule sur la chaîne décimale exacte (pas de float) : jamais
 * d'arrondi vers le haut d'un solde (on tronque), jamais de NaN.
 */
import { formatUnits } from 'ethers';

/**
 * Séparateur décimal des MONTANTS DE TOKENS selon la langue (§8 : formats par
 * langue). Par défaut « . » ; l'app appelle `setNumberLocale('fr')` au chargement.
 * Le fiat (`formatFiat`) garde toujours « , » + espaces (convention de l'app).
 */
let DECIMAL_SEP = '.';
export function setNumberLocale(lang: string): void {
  DECIMAL_SEP = ['fr', 'de', 'es', 'pt', 'it', 'nl', 'pl', 'tr', 'ru'].includes(lang) ? ',' : '.';
}
export function decimalSeparator(): string {
  return DECIMAL_SEP;
}

const MAX_FRAC_LARGE = 4;
const MAX_FRAC_SMALL = 8;
const SIG_SMALL = 4;

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function trimZeros(frac: string): string {
  return frac.replace(/0+$/, '');
}

/** Cœur pur : opère sur "int.frac" (chaîne décimale exacte, positive). */
export function formatDecimalString(s: string, opts: { compact?: boolean; maxFrac?: number } = {}): string {
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [intRaw, fracRaw = ''] = s.split('.');
  const int = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const sign = neg ? '-' : '';

  if (int !== '0') {
    const n = Number(int);
    if (opts.compact && n >= 1_000_000_000) return `${sign}${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} Md`;
    if (opts.compact && n >= 1_000_000) return `${sign}${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')} M`;
    const maxFrac = opts.maxFrac ?? (n >= 1_000_000 ? 2 : MAX_FRAC_LARGE);
    const frac = trimZeros(fracRaw.slice(0, maxFrac));
    return `${sign}${group(int)}${frac ? DECIMAL_SEP + frac : ''}`;
  }

  // < 1 : garder SIG_SMALL chiffres significatifs, plafonné à MAX_FRAC_SMALL décimales.
  const cap = opts.maxFrac ?? MAX_FRAC_SMALL;
  const lead = fracRaw.match(/^0*/)?.[0].length ?? 0;
  const keep = Math.min(cap, lead + SIG_SMALL);
  const frac = trimZeros(fracRaw.slice(0, keep));
  if (frac) return `${sign}0${DECIMAL_SEP}${frac}`;
  // Tout est tombé dans la troncature : poussière non nulle ?
  if (/[1-9]/.test(fracRaw)) return `${sign}<0${DECIMAL_SEP}${'0'.repeat(cap - 1)}1`;
  return '0';
}

/** Montant on-chain (bigint + décimales du token) → chaîne lisible. */
export function formatTokenAmount(raw: bigint, decimals: number, opts: { compact?: boolean } = {}): string {
  return formatDecimalString(formatUnits(raw, decimals), opts);
}

/** Nombre JS (déjà en unités humaines) → même règle. NaN/Infinity → "0". */
export function formatNumber(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '0';
  // toFixed(12) évite la notation scientifique (1e-7) avant découpe.
  return formatDecimalString(Math.abs(n) < 1e-12 ? '0' : n.toFixed(12), opts);
}

/**
 * Valeur à injecter dans un champ de SAISIE (MAX, 50 %…) : précision utile
 * sans délire — max 8 décimales, pas de groupement, pas de « < ». Le reste
 * (< 1e-8 token) est une poussière sans valeur.
 */
export function formatInputAmount(raw: bigint, decimals: number): string {
  const [int, frac = ''] = formatUnits(raw, decimals).split('.');
  const f = trimZeros(frac.slice(0, Math.min(decimals, MAX_FRAC_SMALL)));
  return f ? `${int}.${f}` : int;
}

/**
 * Montant fiat : 2 décimales, milliers groupés, virgule décimale (convention
 * de l'app). < 0,01 non nul → « <0,01 ». NaN → « 0,00 ».
 */
export function formatFiat(v: number, decimals = 2): string {
  const n = Number.isFinite(v) ? v : 0;
  if (n > 0 && n < 0.01 && decimals >= 2) return '<0,01';
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  return `${n < 0 ? '-' : ''}${group(int)}${dec ? ',' + dec : ''}`;
}

/** Pourcentage : 2 décimales, sans zéros inutiles (3.50 → 3.5, 12.00 → 12). */
export function formatPercent(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(decimals).replace(/\.?0+$/, '')} %`;
}
