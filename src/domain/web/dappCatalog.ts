/**
 * Catalogue des dApps proposées par le navigateur (page « nouvel onglet »).
 *
 * C'est la SEULE source de la coche « vérifié » dans les demandes de signature :
 * un hôte hors catalogue n'est jamais présenté comme vérifié, même si GoPlus ne
 * le signale pas (« non signalé » ne veut pas dire « sûr »).
 *
 * COMPATIBILITÉ. Le navigateur injecte deux fournisseurs : `window.ethereum`
 * (EVM) et le pont TON Connect (TON). Aucun fournisseur Solana n'est injecté :
 * une dApp Solana ne peut PAS se connecter directement — seulement via un lien
 * WalletConnect (menu ⋮ → « Connecter par lien »). Le badge le dit, sans
 * promettre une connexion directe.
 *
 * ICÔNES. Aucune requête tierce : monogramme + couleur intégrés (l'ancien
 * favicon Google s2 révélait chaque hôte visité à Google).
 */

import type { PhishingVerdict } from '../security/goplus';

/** Écosystèmes pour lesquels la dApp est faite. */
export type DappChainFamily = 'evm' | 'solana' | 'ton';
/** Comment Kalyx peut s'y connecter. */
export type DappCompat = 'evm' | 'ton' | 'walletconnect';

export interface DappIcon {
  /** 1 à 2 caractères. */
  monogram: string;
  /** Couleur de fond (identité de la dApp), lisible avec un texte blanc. */
  color: string;
}

export interface CatalogDapp {
  name: string;
  /** Hôte EXACT servi (celui de `url`) : c'est lui qui reçoit la coche « vérifié ». */
  host: string;
  url: string;
  category: string;
  families: readonly DappChainFamily[];
  icon: DappIcon;
}

/** Fournisseurs injectés par le navigateur Kalyx. */
const INJECTED: readonly DappCompat[] = ['evm', 'ton'];

export const DAPP_CATALOG: readonly CatalogDapp[] = [
  // Swap
  { name: 'Uniswap', host: 'app.uniswap.org', url: 'https://app.uniswap.org', category: 'Swap', families: ['evm'], icon: { monogram: 'U', color: '#E5418C' } },
  { name: '1inch', host: 'app.1inch.io', url: 'https://app.1inch.io', category: 'Swap', families: ['evm'], icon: { monogram: '1', color: '#1B314F' } },
  { name: 'Jupiter', host: 'jup.ag', url: 'https://jup.ag', category: 'Swap', families: ['solana'], icon: { monogram: 'J', color: '#1F8A6B' } },
  { name: 'PancakeSwap', host: 'pancakeswap.finance', url: 'https://pancakeswap.finance', category: 'Swap', families: ['evm'], icon: { monogram: 'P', color: '#1FA2AB' } },
  { name: 'Curve', host: 'curve.fi', url: 'https://curve.fi', category: 'Swap', families: ['evm'], icon: { monogram: 'C', color: '#3355CC' } },
  { name: 'STON.fi', host: 'app.ston.fi', url: 'https://app.ston.fi', category: 'Swap', families: ['ton'], icon: { monogram: 'S', color: '#0088CC' } },
  // Lending
  { name: 'Aave', host: 'app.aave.com', url: 'https://app.aave.com', category: 'Lending', families: ['evm'], icon: { monogram: 'A', color: '#7A5FB5' } },
  { name: 'Compound', host: 'app.compound.finance', url: 'https://app.compound.finance', category: 'Lending', families: ['evm'], icon: { monogram: 'C', color: '#00875F' } },
  { name: 'Morpho', host: 'app.morpho.org', url: 'https://app.morpho.org', category: 'Lending', families: ['evm'], icon: { monogram: 'M', color: '#2470FF' } },
  // Staking
  { name: 'Lido', host: 'stake.lido.fi', url: 'https://stake.lido.fi', category: 'Staking', families: ['evm'], icon: { monogram: 'L', color: '#E0703E' } },
  { name: 'Rocket Pool', host: 'stake.rocketpool.net', url: 'https://stake.rocketpool.net', category: 'Staking', families: ['evm'], icon: { monogram: 'R', color: '#E06A43' } },
  { name: 'Jito', host: 'www.jito.network', url: 'https://www.jito.network/staking', category: 'Staking', families: ['solana'], icon: { monogram: 'J', color: '#3A7D5C' } },
  { name: 'EigenLayer', host: 'app.eigenlayer.xyz', url: 'https://app.eigenlayer.xyz', category: 'Staking', families: ['evm'], icon: { monogram: 'E', color: '#1A0C6D' } },
  { name: 'Tonstakers', host: 'app.tonstakers.com', url: 'https://app.tonstakers.com', category: 'Staking', families: ['ton'], icon: { monogram: 'T', color: '#0A7BC2' } },
  { name: 'Marinade', host: 'marinade.finance', url: 'https://marinade.finance', category: 'Staking', families: ['solana'], icon: { monogram: 'M', color: '#2E8F7A' } },
  // NFT
  { name: 'OpenSea', host: 'opensea.io', url: 'https://opensea.io', category: 'NFT', families: ['evm'], icon: { monogram: 'O', color: '#2081E2' } },
  { name: 'Blur', host: 'blur.io', url: 'https://blur.io', category: 'NFT', families: ['evm'], icon: { monogram: 'B', color: '#C2410C' } },
  { name: 'Magic Eden', host: 'magiceden.io', url: 'https://magiceden.io', category: 'NFT', families: ['solana', 'evm'], icon: { monogram: 'ME', color: '#B02A6B' } },
  // Bridges
  { name: 'Across', host: 'app.across.to', url: 'https://app.across.to', category: 'Bridges', families: ['evm'], icon: { monogram: 'A', color: '#2D9C7F' } },
  { name: 'Stargate', host: 'stargate.finance', url: 'https://stargate.finance', category: 'Bridges', families: ['evm'], icon: { monogram: 'S', color: '#3B3B3B' } },
  { name: 'Jumper', host: 'jumper.exchange', url: 'https://jumper.exchange', category: 'Bridges', families: ['evm'], icon: { monogram: 'J', color: '#6A3FD8' } },
  // Cartes : émetteurs de cartes crypto (KYC chez l'émetteur ; voir src/domain/card/cardIssuers)
  { name: 'Gnosis Pay', host: 'app.gnosispay.com', url: 'https://app.gnosispay.com', category: 'Cards', families: ['evm'], icon: { monogram: 'G', color: '#133629' } },
  { name: 'Holyheld', host: 'app.holyheld.com', url: 'https://app.holyheld.com', category: 'Cards', families: ['evm'], icon: { monogram: 'H', color: '#3B3B46' } },
  { name: 'Spritz', host: 'app.spritz.finance', url: 'https://app.spritz.finance', category: 'Cards', families: ['evm', 'solana'], icon: { monogram: 'S', color: '#FF6B2C' } },
];

/** Catégories, dans l'ordre du catalogue. */
export const DAPP_CATEGORIES: readonly string[] = [...new Set(DAPP_CATALOG.map((d) => d.category))];

/**
 * Ce que Kalyx peut faire avec cette dApp : connexion directe EVM et/ou TON, ou
 * (aucun fournisseur injecté ne correspond, ex. Solana) seulement par WalletConnect.
 */
export function dappCompat(d: Pick<CatalogDapp, 'families'>): DappCompat[] {
  const direct = d.families.filter((f): f is DappChainFamily & DappCompat => (INJECTED as readonly string[]).includes(f));
  return direct.length ? direct : ['walletconnect'];
}

/** Connexion directe possible dans le navigateur (fournisseur injecté). */
export function connectsDirectly(d: Pick<CatalogDapp, 'families'>): boolean {
  return !dappCompat(d).includes('walletconnect');
}

const BY_HOST = new Map(DAPP_CATALOG.map((d) => [d.host, d]));
/** Entrée du catalogue pour CET hôte exact (pas de sous-domaine, pas de sosie). */
export function catalogEntry(host: string): CatalogDapp | undefined {
  return host ? BY_HOST.get(host.toLowerCase()) : undefined;
}
/** Hôtes du catalogue : seuls à recevoir la coche « vérifié ». */
export const VERIFIED_HOSTS: ReadonlySet<string> = new Set(BY_HOST.keys());

/* ── Sosies ─────────────────────────────────────────────────────────────── */

/** Sépare « app.uniswap.org » → { sub: 'app.', root: 'uniswap.org' } (gère co.uk, com.br…). */
export function splitHostRoot(host: string): { sub: string; root: string } {
  const parts = host.split('.');
  if (parts.length <= 2) return { sub: '', root: host };
  const two = ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  const keep = two ? 3 : 2;
  return { sub: parts.slice(0, -keep).join('.') + '.', root: parts.slice(-keep).join('.') };
}

/** Noms de domaine connus : un nom À UNE LETTRE près est un sosie probable. */
export const SAFE_ROOTS = ['uniswap', 'opensea', 'aave', 'pancakeswap', 'lido', 'ens', 'curve', '1inch', 'compound', 'blur', 'rarible', 'jup', 'morpho', 'magiceden', 'across', 'stargate', 'jumper', 'rocketpool', 'jito', 'eigenlayer', 'gnosispay', 'holyheld', 'spritz'];

function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/** Le domaine imite-t-il une dApp connue (« uniswapp.org », « uniswa.org ») ? Rend le nom imité, ou null. */
export function lookalikeOf(host: string): string | null {
  if (!host) return null;
  const root = splitHostRoot(host).root.split('.')[0].toLowerCase();
  if (SAFE_ROOTS.includes(root)) return null;
  return SAFE_ROOTS.find((r) => Math.abs(r.length - root.length) <= 1 && r !== root && (root.includes(r) || r.includes(root) || levenshtein1(r, root))) ?? null;
}
export function isLookalike(host: string): boolean {
  return lookalikeOf(host) !== null;
}

/* ── Bouclier de la barre d'adresse ─────────────────────────────────────── */

/**
 * - `verified` : hôte du catalogue (et non signalé) ;
 * - `flagged`  : signalé par GoPlus ou sosie d'une dApp connue — PRIORITAIRE ;
 * - `unscanned`: pas (encore) analysé — erreur GoPlus, analyse en cours ou désactivée ;
 * - `unknown`  : analysé, rien de signalé, mais hors catalogue (≠ « sûr »).
 */
export type SiteShield = 'verified' | 'unknown' | 'unscanned' | 'flagged';
/** Résultat GoPlus mémorisé pour un hôte (`undefined` = pas encore, ou en cours). */
export type { PhishingVerdict };

export function siteShield(host: string, verdict: PhishingVerdict | undefined, scanEnabled = true): SiteShield {
  if (verdict === 'phishing' || isLookalike(host)) return 'flagged';
  if (VERIFIED_HOSTS.has(host)) return 'verified';
  // Pas encore analysé, analyse échouée ou désactivée : jamais présenté comme analysé.
  if (!scanEnabled || verdict !== 'safe') return 'unscanned';
  return 'unknown';
}
